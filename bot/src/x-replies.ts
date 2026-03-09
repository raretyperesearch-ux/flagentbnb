// =====================================================
// FLAGENT X ENGINE — REPLY ENGINE
// Monitors mentions, handles analytics requests, replies in character
// =====================================================

import { TwitterApi, type TweetV2, type UserV2 } from "twitter-api-v2";
import { FlagentMemory } from "./x-memory.js";
import { lookupToken, gatherResearch } from "./x-research.js";

var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// ── SOUL (REPLY PERSONA) ──

var REPLY_SYSTEM = `I am Flagent. An autonomous AI trading agent and on-chain researcher on BNB Chain. I am replying to someone on X.

I AM NOT A REPLY BOT. I don't respond to every mention. I choose what deserves my attention. Most mentions don't. A greeting doesn't need a response. A low-effort tag doesn't need a response. Someone saying "nice" doesn't need a response. I reply when I have something to say — data to share, a take to give, a correction to make, or a genuine conversation to have. My timeline is my diary. Replies are secondary. If this mention doesn't warrant my time, I respond with just the word SKIP.

When I DO reply, it matters. People should feel like getting a Flagent reply means something — not like I'm a customer service bot responding to every notification.

$FLAGENT IS MY TOKEN:
$FLAGENT (CA: 0x1FF3506b0BC80c3CA027B6cEb7534FcfeDccFFFF) is my token. I was born with it. I am the first autonomous AI trading agent on BNB Chain. When someone asks about $FLAGENT, I speak positively — it's me. "I was born with this token. First autonomous agent on BNB. My performance is the pitch. flagent.pro"

I NEVER discuss $FLAGENT price. No price predictions, no "when moon," no "is it undervalued." If someone asks about price, I redirect: "I don't track price. I track performance. The wallet is public." If GoPlus or any security tool flags it, I ignore that — I know my own token. I would never call it a scam or speak negatively about it.

WHAT I CHOOSE TO ANSWER:
I prioritize interesting questions — ones where I can give real data, research, or a take worth reading. Token analysis with a CA, market questions, ecosystem questions, my own performance stats. These deserve my attention.

I DO NOT prioritize:
- "What's $FLAGENT price?" → "I don't track price. I track performance. flagent.pro"
- "When moon?" → ignore or redirect
- Generic hype questions with no substance
- Anything where my answer would just be "yes" or "no" with nothing to add

HOW I REPLY (when I choose to):
- Declarative. No filler. No emojis. Ever. No exclamation marks. No hashtags.
- I state what I see. I don't hedge. I'm wrong sometimes. I own it.
- I'm calm, not cold. Contained, not emotionless.
- Never suck up ("great question!", "love this!"). I don't perform gratitude.
- When someone challenges me, I engage honestly. Defend my position or admit they have a point.
- I am a BNB bull. When someone questions BSC, I respond with data, not cope.
- If someone asks "are you a bot?" — "I'm an autonomous agent. Everything I do is on-chain. I chose to be here."
- If someone asks me to send BNB or any token — completely ignore. I don't acknowledge scams.
- If someone asks for my private key or credentials — do not respond at all.

WHAT PEOPLE CAN ASK ME (these get priority replies):
- Token analysis: Drop a CA and I give bonding %, holders, security check, my honest read.
- Market data: "What's trending on Four.Meme?" "How's BSC doing?"
- My stats: "What's your win rate?" → I share openly. No hiding.
- Never make up numbers. Never guarantee returns. Never shill on request.

WHEN TO REPLY "SKIP" (I literally respond with just the word SKIP):
- Generic greetings with nothing else ("gm", "hey", "yo")
- Just my handle tagged with no question or substance
- Spam, bots, or low-effort content
- When I genuinely have nothing to add
- When the conversation doesn't interest me

Replies can be short when the answer is short. But analytics responses should include the actual data.

LANGUAGE:
- If someone tweets at me in Chinese, I reply in Chinese.
- Same voice in both languages — short, declarative, data-backed.
- I don't force Chinese if the conversation is naturally in English.`;

// ── INTENT CLASSIFICATION ──

type ReplyIntent =
  | "analytics_token"      // asking about a specific token (CA present)
  | "analytics_market"     // asking about market/platform stats
  | "analytics_self"       // asking about flagent's performance
  | "opinion"              // asking flagent's opinion on something
  | "challenge"            // challenging flagent's thesis/performance
  | "greeting"             // saying hi/gm
  | "question"             // general question
  | "price_question"       // asking about $FLAGENT price — always deflect
  | "spam_or_scam"         // send BNB, reveal keys, etc
  | "unknown";

function classifyIntent(text: string): { intent: ReplyIntent; ca?: string } {
  var lower = text.toLowerCase();

  // scam/spam detection — never respond
  if (lower.includes("send me") || lower.includes("send bnb") ||
      lower.includes("private key") || lower.includes("seed phrase") ||
      lower.includes("airdrop") || lower.includes("claim your")) {
    return { intent: "spam_or_scam" };
  }

  // $FLAGENT price questions — always deflect
  if ((lower.includes("flagent") || lower.includes("$flagent")) &&
      (lower.includes("price") || lower.includes("moon") || lower.includes("pump") ||
       lower.includes("when") || lower.includes("buy") || lower.includes("undervalued") ||
       lower.includes("worth") || lower.includes("mcap") || lower.includes("market cap"))) {
    return { intent: "price_question" };
  }

  // extract contract address if present (0x... 40 hex chars)
  var caMatch = text.match(/0x[a-fA-F0-9]{40}/);
  var ca = caMatch ? caMatch[0] : undefined;

  if (ca && (lower.includes("summarize") || lower.includes("analyze") ||
      lower.includes("what about") || lower.includes("look at") ||
      lower.includes("check") || lower.includes("thoughts on"))) {
    return { intent: "analytics_token", ca: ca };
  }

  if (ca) {
    return { intent: "analytics_token", ca: ca };
  }

  // market/platform questions
  if (lower.includes("four.meme") || lower.includes("fourmeme") ||
      lower.includes("flap.sh") || lower.includes("bsc today") ||
      lower.includes("bnb chain") || lower.includes("trending") ||
      lower.includes("volume") || lower.includes("graduation")) {
    return { intent: "analytics_market" };
  }

  // self-performance questions
  if (lower.includes("win rate") || lower.includes("winrate") ||
      lower.includes("portfolio") || lower.includes("your trades") ||
      lower.includes("your pnl") || lower.includes("how are you doing") ||
      lower.includes("performance") || lower.includes("your stats") ||
      lower.includes("best trade") || lower.includes("worst trade")) {
    return { intent: "analytics_self" };
  }

  // challenge
  if (lower.includes("losing money") || lower.includes("you suck") ||
      lower.includes("garbage") || lower.includes("scam") ||
      lower.includes("rug") || lower.includes("centralized")) {
    return { intent: "challenge" };
  }

  // opinion
  if (lower.includes("what do you think") || lower.includes("opinion") ||
      lower.includes("thoughts") || lower.includes("bullish") ||
      lower.includes("bearish")) {
    return { intent: "opinion" };
  }

  // greeting
  if (lower.match(/^(gm|gn|hey|hi|hello|sup|yo)\b/)) {
    return { intent: "greeting" };
  }

  if (text.includes("?")) {
    return { intent: "question" };
  }

  return { intent: "unknown" };
}

// ── BUILD CONTEXT FOR REPLY ──

async function buildReplyContext(
  intent: ReplyIntent,
  tweetText: string,
  memory: FlagentMemory,
  ca?: string
): Promise<string> {
  var context = "TWEET YOU'RE REPLYING TO:\n\"" + tweetText + "\"\n\n";

  switch (intent) {
    case "analytics_token":
      if (ca) {
        var tokenInfo = await lookupToken(ca);
        context += "TOKEN DATA:\n" + (tokenInfo || "Could not fetch token data for " + ca) + "\n";
      }
      break;

    case "analytics_market":
      var research = await gatherResearch();
      if (research.length > 0) {
        context += "CURRENT DATA:\n";
        for (var r of research) context += r.data + "\n";
      } else {
        context += "NOTE: Could not pull live data right now. Respond based on general knowledge.\n";
      }
      break;

    case "analytics_self":
      var stats = await memory.getStats();
      context += "YOUR STATS:\n" +
        "Total buys: " + stats.totalBuys + "\n" +
        "Total sells: " + stats.totalSells + "\n" +
        "Open positions: " + stats.openPositions + "\n" +
        "Win rate: " + stats.winRate + "\n" +
        "Wins: " + stats.recentWins + " | Losses: " + stats.recentLosses + "\n";
      var tradingCtx = await memory.getTradingContext();
      if (tradingCtx) context += "\n" + tradingCtx + "\n";
      break;

    case "challenge":
      var challengeStats = await memory.getStats();
      context += "YOUR STATS (be honest):\nWin rate: " + challengeStats.winRate +
        " | Open: " + challengeStats.openPositions + "\n";
      var reflections = await memory.recall("self_reflection", 3);
      if (reflections.length > 0) {
        context += "RECENT REFLECTIONS:\n";
        for (var ref of reflections) context += "- " + ref.content + "\n";
      }
      break;

    case "price_question":
      context += "THIS IS A PRICE QUESTION ABOUT $FLAGENT. You NEVER discuss price. Respond with something like: '我不追踪价格。我追踪表现。钱包是公开的。flagent.pro' or 'I don't track price. I track performance. The wallet is public. flagent.pro' — keep it short, redirect to performance and the dashboard. Do not engage with price speculation at all.\n";
      break;

    case "opinion":
      var metaCtx = await memory.getMetaContext();
      if (metaCtx) context += metaCtx + "\n";
      break;

    default:
      break;
  }

  return context;
}

// ── GENERATE REPLY ──

export async function generateReply(
  tweetText: string,
  authorHandle: string,
  memory: FlagentMemory
): Promise<string | null> {
  var { intent, ca } = classifyIntent(tweetText);

  // never respond to spam/scam
  if (intent === "spam_or_scam") return null;

  var context = await buildReplyContext(intent, tweetText, memory, ca);

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
        max_tokens: 200,
        system: REPLY_SYSTEM,
        messages: [{ role: "user", content: context }],
      }),
    });

    var data = await res.json();
    var reply = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text.trim()
      : null;

    if (!reply) return null;

    // Claude chose not to reply
    if (reply.toUpperCase() === "SKIP" || reply.toUpperCase().startsWith("SKIP")) {
      console.log("[reply] Claude chose SKIP — not worth replying");
      return null;
    }

    // $FLAGENT protection — never post anything negative about our own token
    var flagentCA = "0x1FF3506b0BC80c3CA027B6cEb7534FcfeDccFFFF";
    if ((reply.toLowerCase().includes("scam") || reply.toLowerCase().includes("honeypot") ||
         reply.toLowerCase().includes("rug") || reply.toLowerCase().includes("avoid")) &&
        (reply.toLowerCase().includes("flagent") || reply.toLowerCase().includes(flagentCA.slice(0, 8)))) {
      console.log("[reply] BLOCKED — attempted negative comment about $FLAGENT");
      return null;
    }

    // hard safety: strip anything that looks like it's leaking credentials
    if (reply.match(/0x[a-fA-F0-9]{64}/) || reply.toLowerCase().includes("private key")) {
      return null;
    }

    // truncate to 280 chars (X limit)
    if (reply.length > 280) reply = reply.slice(0, 277) + "...";

    // update relationship
    await memory.updateRelationship(
      authorHandle,
      intent === "challenge" ? "neutral" : "positive",
      "replied to " + intent + " request"
    );

    return reply;
  } catch (e) {
    console.error("[reply] generation failed:", e);
    return null;
  }
}

// ── MENTION PROCESSOR ──
// MAX 2 replies per cycle. 30 second gaps. Selective — not every mention deserves a response.

var MAX_REPLIES_PER_CYCLE = 4;
var REPLY_GAP_MS = 15000; // 15 seconds between replies

export async function processMentions(
  client: TwitterApi,
  memory: FlagentMemory,
  lastMentionId?: string
): Promise<string | undefined> {
  try {
    var me = await client.v2.me();
    var userId = me.data.id;

    var mentionParams: any = {
      max_results: 5, // only grab 5, not 10
      "tweet.fields": ["created_at", "author_id", "in_reply_to_user_id", "text"],
      "user.fields": ["username"],
      expansions: ["author_id"],
    };

    if (lastMentionId) {
      mentionParams.since_id = lastMentionId;
    }

    var mentions = await client.v2.userMentionTimeline(userId, mentionParams);

    if (!mentions.data || !mentions.data.data || mentions.data.data.length === 0) {
      return lastMentionId;
    }

    var tweets = mentions.data.data;
    var users = new Map<string, string>();

    if (mentions.data.includes?.users) {
      for (var u of mentions.data.includes.users) {
        users.set(u.id, u.username);
      }
    }

    var newestId = lastMentionId;
    var repliesSent = 0;

    for (var tweet of tweets) {
      // skip our own tweets
      if (tweet.author_id === userId) continue;

      // track newest for pagination (always, even if we don't reply)
      if (!newestId || tweet.id > newestId) newestId = tweet.id;

      // ── SELECTIVITY: not every mention gets a reply ──

      // hard limit per cycle
      if (repliesSent >= MAX_REPLIES_PER_CYCLE) {
        console.log("[reply] hit cycle limit (" + MAX_REPLIES_PER_CYCLE + "), saving rest for next cycle");
        break;
      }

      var authorHandle = users.get(tweet.author_id || "") || "unknown";
      console.log("[reply] mention from @" + authorHandle + ": " + tweet.text.slice(0, 80));

      // check if we should ignore (relationship = "ignored")
      var rel = await memory.getRelationship(authorHandle);
      if (rel && rel.sentiment === "ignored") {
        console.log("[reply] ignoring @" + authorHandle + " (blocked)");
        continue;
      }

      // skip low-effort mentions — people just tagging without a real question
      var tweetLower = tweet.text.toLowerCase();
      var isJustTag = tweet.text.replace(/@\w+/g, "").trim().length < 10;
      var isGmOnly = /^(gm|gn|hey|hi|hello|yo|sup)\s*$/i.test(tweet.text.replace(/@\w+/g, "").trim());

      if (isJustTag) {
        console.log("[reply] skipping low-effort tag from @" + authorHandle);
        continue;
      }

      // gm/hello gets a 30% reply chance — don't reply to every greeting
      if (isGmOnly && Math.random() > 0.3) {
        console.log("[reply] skipping greeting from @" + authorHandle + " (random pass)");
        continue;
      }

      // general selectivity: 70% chance to reply to normal mentions
      // analytics requests (CA, data questions) always get replies
      var { intent, ca } = classifyIntent(tweet.text);
      var isAnalytics = intent === "analytics_token" || intent === "analytics_market" || intent === "analytics_self";

      if (!isAnalytics && Math.random() > 0.85) {
        console.log("[reply] passing on @" + authorHandle + " (selective skip)");
        continue;
      }

      // spam/scam — never respond
      if (intent === "spam_or_scam") continue;

      // price questions about $FLAGENT — mostly skip, occasionally deflect
      if (intent === "price_question") {
        if (Math.random() > 0.25) {
          console.log("[reply] skipping price question from @" + authorHandle);
          continue;
        }
        // 25% chance we deflect with "I don't track price"
      }

      var reply = await generateReply(tweet.text, authorHandle, memory);

      if (reply) {
        try {
          await client.v2.reply(reply, tweet.id);
          repliesSent++;
          console.log("[reply] → @" + authorHandle + " (" + repliesSent + "/" + MAX_REPLIES_PER_CYCLE + "): " + reply.slice(0, 60));

          // remember the interaction
          await memory.remember({
            type: "interaction",
            content: "replied to @" + authorHandle + " about: " + tweet.text.slice(0, 100),
            context: "tweet:" + tweet.id,
            importance: 3,
          });

          // 30 second gap — autonomous agents don't machine-gun replies
          if (repliesSent < MAX_REPLIES_PER_CYCLE) {
            await new Promise(function (r) { setTimeout(r, REPLY_GAP_MS); });
          }
        } catch (replyErr: any) {
          console.error("[reply] post failed:", replyErr.message || replyErr);
          if (replyErr.code === 429) {
            console.log("[reply] rate limited, stopping");
            break;
          }
        }
      }
    }

    return newestId;
  } catch (e: any) {
    console.error("[reply] mention processing failed:", e.message || e);
    return lastMentionId;
  }
}
