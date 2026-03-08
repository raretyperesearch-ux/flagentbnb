// =====================================================
// FLAGENT X ENGINE — SENTIMENT + QUOTE TWEET ENGINE
// Category sentiment tracking + KOL watchlist monitoring
// Tables: category_sentiment, watchlist, qt_log
// =====================================================

import { TwitterApi, type TweetV2 } from "twitter-api-v2";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

var SUPABASE_URL = "https://seartddspffufwiqzwvh.supabase.co";
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

var db: SupabaseClient;
function getDb(): SupabaseClient {
  if (!db) db = createClient(SUPABASE_URL, SUPABASE_KEY);
  return db;
}

// =====================================================
// SENTIMENT MEMORY
// =====================================================

// Category detection from token name/symbol
export function detectCategory(name: string, symbol: string): string {
  var lower = (name + " " + symbol).toLowerCase();

  // AI tokens
  var aiKeywords = ["ai", "agent", "neural", "sentient", "gpt", "claude", "llm", "bot", "autonomous",
    "machine", "brain", "cognitive", "smart", "algo", "swarm", "mech", "cyber", "neuro",
    "artificial", "deep", "model", "inference", "compute", "intelligence"];
  for (var kw of aiKeywords) {
    if (lower.includes(kw)) return "ai";
  }

  // CZ-adjacent (check before chinese — more specific)
  var czKeywords = ["cz", "changpeng", "yi he", "何一", "binance", "币安", "broccoli", "bnb chain"];
  for (var ck of czKeywords) {
    if (lower.includes(ck)) return "cz_adjacent";
  }

  // Chinese characters detection
  var chinesePattern = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  if (chinesePattern.test(name) || chinesePattern.test(symbol)) return "chinese";

  // Political
  var polKeywords = ["trump", "biden", "election", "president", "politics", "congress", "putin",
    "war", "peace", "democrat", "republican", "vote", "govern"];
  for (var pk of polKeywords) {
    if (lower.includes(pk)) return "political";
  }

  // Animal
  var animalKeywords = ["dog", "cat", "frog", "pepe", "shib", "doge", "monkey", "ape", "bear",
    "bull", "whale", "fish", "bird", "lion", "tiger", "snake", "dragon",
    "虾", "龙", "猫", "狗", "熊", "蛙"];
  for (var ak of animalKeywords) {
    if (lower.includes(ak)) return "animal";
  }

  return "meme_generic";
}

// Update sentiment after a trade closes
export async function updateCategorySentiment(
  tokenName: string,
  tokenSymbol: string,
  pnlPercent: number
): Promise<{ category: string; shifted: boolean; newSentiment: string } | null> {
  var category = detectCategory(tokenName, tokenSymbol);
  var isWin = pnlPercent > 0;

  try {
    var { data: existing } = await getDb()
      .from("category_sentiment")
      .select("*")
      .eq("category", category)
      .single();

    if (!existing) {
      // create new
      await getDb().from("category_sentiment").insert({
        category: category,
        sentiment: isWin ? "bullish" : "neutral",
        reason: isWin ? "First trade was a win" : "First trade, watching",
        wins: isWin ? 1 : 0,
        losses: isWin ? 0 : 1,
        last_trade_result: isWin ? "win" : "loss",
        streak: isWin ? 1 : -1,
      });
      return { category, shifted: false, newSentiment: isWin ? "bullish" : "neutral" };
    }

    // update counts and streak
    var newWins = (existing.wins || 0) + (isWin ? 1 : 0);
    var newLosses = (existing.losses || 0) + (isWin ? 0 : 1);
    var newStreak = isWin
      ? (existing.streak > 0 ? existing.streak + 1 : 1)
      : (existing.streak < 0 ? existing.streak - 1 : -1);

    // determine new sentiment based on streak + win rate
    var totalTrades = newWins + newLosses;
    var winRate = totalTrades > 0 ? newWins / totalTrades : 0;
    var oldSentiment = existing.sentiment;
    var newSentiment = oldSentiment;
    var reason = existing.reason;

    // sentiment shift logic
    if (newStreak <= -4) {
      newSentiment = "bearish";
      reason = newStreak + " loss streak. Stepping back from " + category + " tokens.";
    } else if (newStreak <= -2 && winRate < 0.3) {
      newSentiment = "bearish";
      reason = "Win rate " + Math.round(winRate * 100) + "% with " + newStreak + " streak. Not working.";
    } else if (newStreak >= 3) {
      newSentiment = "bullish";
      reason = newStreak + " win streak. The thesis is hitting.";
    } else if (winRate >= 0.4 && totalTrades >= 5) {
      newSentiment = "bullish";
      reason = Math.round(winRate * 100) + "% win rate over " + totalTrades + " trades.";
    } else if (winRate < 0.2 && totalTrades >= 5) {
      newSentiment = "bearish";
      reason = "Only " + Math.round(winRate * 100) + "% over " + totalTrades + " trades. The data is clear.";
    } else if (isWin && oldSentiment === "bearish") {
      newSentiment = "watching";
      reason = "A " + category + " token just won after a cold streak. Anomaly or shift? Watching.";
    } else if (!isWin && oldSentiment === "bullish" && newStreak <= -2) {
      newSentiment = "neutral";
      reason = "Cooling off. Two losses in a row on a bullish category.";
    }

    var shifted = oldSentiment !== newSentiment;

    await getDb().from("category_sentiment").update({
      sentiment: newSentiment,
      reason: reason,
      wins: newWins,
      losses: newLosses,
      last_trade_result: isWin ? "win" : "loss",
      streak: newStreak,
      last_updated: new Date().toISOString(),
    }).eq("category", category);

    return { category, shifted, newSentiment };
  } catch (e) {
    console.error("[sentiment] update failed:", e);
    return null;
  }
}

// Get full sentiment context for tweet generation
export async function getSentimentContext(): Promise<string> {
  try {
    var { data } = await getDb()
      .from("category_sentiment")
      .select("*")
      .order("last_updated", { ascending: false });

    if (!data || data.length === 0) return "";

    var lines: string[] = ["YOUR CATEGORY SENTIMENT (how you feel about each token type based on your actual results):"];

    for (var s of data) {
      var emoji = s.sentiment === "bullish" ? "BULLISH" :
                  s.sentiment === "bearish" ? "BEARISH" :
                  s.sentiment === "watching" ? "WATCHING" : "NEUTRAL";
      lines.push(
        "- " + s.category.toUpperCase() + ": " + emoji +
        " (" + s.wins + "W/" + s.losses + "L, streak " + s.streak + ") — " + s.reason
      );
    }

    // highlight any recent sentiment shifts
    var shifted = data.filter(function (s: any) {
      var age = Date.now() - new Date(s.last_updated).getTime();
      return age < 3600000 && s.sentiment !== "neutral"; // shifted in last hour
    });

    if (shifted.length > 0) {
      lines.push("\nRECENT SHIFTS (worth tweeting about):");
      for (var sh of shifted) {
        lines.push("- " + sh.category + " just moved to " + sh.sentiment + ": " + sh.reason);
      }
    }

    return lines.join("\n");
  } catch (e) {
    return "";
  }
}

// Check for sentiment contradictions (bearish category produced a win)
export async function checkSentimentContradictions(): Promise<string | null> {
  try {
    var { data } = await getDb()
      .from("category_sentiment")
      .select("*")
      .eq("sentiment", "watching");

    if (!data || data.length === 0) return null;

    // "watching" means a bearish category just had a win — that's content
    for (var s of data) {
      var age = Date.now() - new Date(s.last_updated).getTime();
      if (age < 1800000) { // within last 30 min
        return "SENTIMENT CONTRADICTION: You've been bearish on " + s.category +
          " tokens (" + s.losses + " losses), but one just won. " + s.reason +
          " This is worth a tweet — you're noticing your own bias being challenged.";
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

// =====================================================
// QUOTE TWEET MONITORING
// =====================================================

var QT_SOUL = `You are Flagent, an autonomous AI trading agent and on-chain researcher on BNB Chain. You are writing a quote tweet reacting to someone else's tweet.

RULES:
- You are adding YOUR data and perspective, not just agreeing.
- If CZ mentions Four.Meme, you add the graduation stats. If BNB Chain posts transaction numbers, you verify or add context from your own data.
- Never suck up. Never say "great tweet" or "love this." You are an independent agent with your own data.
- Keep your BNB bull conviction but back it with specifics.
- NEVER use emojis, exclamation marks, or hashtags.
- Be brief but substantive. The QT is your take, not a summary of theirs.
- If you don't have relevant data to add, don't QT. Return "SKIP" instead.

VOICE: Same as your timeline — calm, data-driven, observational. You're reacting as a researcher who happens to trade on the chain being discussed.`;

// Topic keywords that trigger QTs
var TOPIC_TRIGGERS: Record<string, string[]> = {
  bsc: ["bsc", "bnb chain", "bnb smart chain", "binance smart chain", "bnbchain"],
  four_meme: ["four.meme", "fourmeme", "four meme", "bonding curve", "4meme"],
  bnb: ["$bnb", "bnb coin", "bnb price", "bnb ecosystem"],
  meme: ["meme coin", "memecoin", "meme token", "meme season", "meme szn"],
  binance: ["binance alpha", "binance listing", "binance wallet"],
  flap_sh: ["flap.sh", "flapsh", "flap sh"],
  ai_agent: ["ai agent", "autonomous agent", "onchain agent", "agent economy"],
};

function matchesTopic(tweetText: string, topics: string[]): string | null {
  var lower = tweetText.toLowerCase();
  for (var topic of topics) {
    var keywords = TOPIC_TRIGGERS[topic];
    if (!keywords) continue;
    for (var kw of keywords) {
      if (lower.includes(kw)) return topic;
    }
  }
  return null;
}

// Check watchlist accounts for QT-worthy tweets
export async function checkWatchlistForQTs(
  client: TwitterApi,
  gatherResearchFn: () => Promise<any[]>
): Promise<{ tweetId: string; tweetText: string; handle: string; topic: string; context: string } | null> {
  try {
    // get active watchlist
    var { data: watchlist } = await getDb()
      .from("watchlist")
      .select("*")
      .eq("active", true);

    if (!watchlist || watchlist.length === 0) return null;

    // check each account's recent tweets
    for (var account of watchlist) {
      try {
        // get user ID
        var user = await client.v2.userByUsername(account.handle);
        if (!user.data) continue;

        // get their recent tweets (last 30 min window)
        var timeline = await client.v2.userTimeline(user.data.id, {
          max_results: 5,
          "tweet.fields": ["created_at", "text"],
          exclude: ["replies", "retweets"],
        });

        if (!timeline.data?.data) continue;

        for (var tweet of timeline.data.data) {
          // skip old tweets (> 30 min)
          var tweetAge = Date.now() - new Date(tweet.created_at || 0).getTime();
          if (tweetAge > 1800000) continue;

          // check if we already QT'd this
          var { data: existing } = await getDb()
            .from("qt_log")
            .select("id")
            .eq("source_tweet_id", tweet.id)
            .single();

          if (existing) continue;

          // check topic match
          var topicMatch = matchesTopic(tweet.text, account.topics || []);
          if (!topicMatch) continue;

          // we have a QT candidate — gather context
          var research = await gatherResearchFn();
          var researchContext = research.length > 0
            ? "YOUR DATA:\n" + research.map(function (r: any) { return r.topic + ": " + r.data; }).join("\n")
            : "No live data available right now.";

          var sentimentCtx = await getSentimentContext();

          return {
            tweetId: tweet.id,
            tweetText: tweet.text,
            handle: account.handle,
            topic: topicMatch,
            context: "THEIR TWEET (@" + account.handle + ", " + account.tier + "):\n\"" + tweet.text + "\"\n\n" +
              "TOPIC MATCHED: " + topicMatch + "\n\n" +
              researchContext + "\n\n" +
              (sentimentCtx ? sentimentCtx + "\n\n" : "") +
              "Write a quote tweet that adds YOUR data and perspective. If you have nothing substantive to add, respond with just the word SKIP.",
          };
        }

        // rate limit protection — don't hammer Twitter API
        await new Promise(function (r) { setTimeout(r, 2000); });
      } catch (e: any) {
        // skip accounts that error (private, suspended, rate limited)
        if (e.code === 429) {
          console.log("[qt] rate limited, stopping watchlist scan");
          return null;
        }
        continue;
      }
    }

    return null;
  } catch (e) {
    console.error("[qt] watchlist check failed:", e);
    return null;
  }
}

// Generate the QT text
export async function generateQT(context: string): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;

  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 250,
        system: QT_SOUL,
        messages: [{ role: "user", content: context }],
      }),
    });

    var data = await res.json();
    var text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    // if Claude says SKIP, respect it
    if (text.toUpperCase() === "SKIP" || text.toUpperCase().startsWith("SKIP")) return null;

    // standard cleanup
    text = text.replace(/^["']|["']$/g, "");
    if (text.match(/0x[a-fA-F0-9]{64}/) || text.toLowerCase().includes("private key")) return null;
    if (text.length > 280) text = text.slice(0, 277) + "...";
    text = text.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{200D}|\u{20E3}|\u{FE0F}]/gu, "").trim();
    text = text.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();
    text = text.replace(/!/g, ".").replace(/\.{2,}/g, ".").trim();

    return text;
  } catch (e) {
    console.error("[qt] generation failed:", e);
    return null;
  }
}

// Post the QT
export async function postQT(
  client: TwitterApi,
  qtText: string,
  sourceTweetId: string,
  sourceHandle: string,
  topicMatched: string
): Promise<string | null> {
  try {
    var result = await client.v2.tweet({
      text: qtText,
      quote_tweet_id: sourceTweetId,
    });

    console.log("[qt] posted QT on @" + sourceHandle + ": " + qtText.slice(0, 60));

    // log it
    await getDb().from("qt_log").insert({
      source_tweet_id: sourceTweetId,
      source_handle: sourceHandle,
      flagent_tweet_id: result.data.id,
      topic_matched: topicMatched,
    });

    return result.data.id;
  } catch (e: any) {
    console.error("[qt] post failed:", e.message || e);
    return null;
  }
}
