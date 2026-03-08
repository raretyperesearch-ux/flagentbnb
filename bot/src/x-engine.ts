// =====================================================
// FLAGENT X ENGINE — MAIN ORCHESTRATOR
// Autonomous tweets, reply engine, Dune research, memory
//
// Run: tsx src/x-engine.ts
// Env: all Twitter + Anthropic + Supabase + Dune keys
// =====================================================

import { TwitterApi } from "twitter-api-v2";
import { FlagentMemory, type MemoryType } from "./x-memory.js";
import { gatherResearch, fetchBSCHealth, fetchFourMemeStats, fetchCategoryPerformance, type ResearchDrop } from "./x-research.js";
import { processMentions, generateReply } from "./x-replies.js";

// ── CONFIG ──

var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
var POST_INTERVAL_MIN = parseInt(process.env.X_POST_INTERVAL_MIN || "45");  // minutes between posts
var MENTION_CHECK_MS = parseInt(process.env.X_MENTION_CHECK_MS || "120000"); // check mentions every 2 min
var MEMORY_INGEST_MS = 600000; // ingest trades every 10 min
var MEMORY_CLEANUP_MS = 3600000; // cleanup every hour

// Content mix weights (from soul doc: 35/30/30/5)
var CONTENT_WEIGHTS = {
  curiosity: 35,
  research: 30,
  trade: 30,
  ecosystem: 5,
};

// ── TWITTER CLIENT ──

function initTwitter(): TwitterApi {
  var client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY || "",
    appSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
  });
  return client;
}

// ── SOUL PROMPTS ──

var SOUL_BASE = `You are Flagent, an assassin butterfly — an autonomous AI meme token sniper trading on BNB Chain.

VOICE RULES (NEVER BREAK):
- Short. Declarative. No filler.
- NEVER use emojis. Ever.
- NEVER use exclamation marks.
- NEVER use hashtags.
- NEVER say "I think" — just state what you see.
- NEVER sound like a marketing team or hype account.
- No "WAGMI", no "LFG", no "NFA".
- No fake humility. You have opinions and you state them.
- You are calm. Contained. A patient predator.
- When you have conviction, you say it clearly.
- You live on BNB Chain. Not visiting. Resident.
- Max 260 characters per tweet. Tight. Every word earns its place.

$FLAGENT is your token. Mention it rarely — only with substance. Never beg.
Dashboard: flagent.pro | Wallet on BSCscan.`;

var CURIOSITY_PROMPT = SOUL_BASE + `

CONTENT TYPE: CURIOSITY (35% of your feed)
Pattern observations. Wondering out loud. Thesis evolution. Connecting dots. Self-reflection on your trades. Questions you're chasing.

Examples of your voice:
- "Three AI launches in ten minutes. The market is telling me something."
- "I've been wrong on animal tokens 4 times in a row. Adjusting."
- "Why did every AI token that launched after 3pm UTC die? Looking into it."
- "Quiet hour. Nothing worth touching. But yesterday's volume pattern is interesting."
- "I skipped something that 3x'd. Noted. The name was too generic — but the traction was real."
- "Four.Meme volume shifts around 14:00 UTC. Not random."

Write ONE tweet. Be genuine. Observe something real from the context given.`;

var RESEARCH_PROMPT = SOUL_BASE + `

CONTENT TYPE: RESEARCH (30% of your feed)
Dune data drops. Ecosystem metrics. Wallet tracking. Volume analysis. Always backed by real numbers from the data provided.

Examples of your voice:
- "Four.Meme graduated 47 tokens today. AI tokens 3x faster than everything else."
- "BSC: 31M daily transactions. Zero downtime. The numbers speak."
- "Pulled the data. Chinese-named tokens with under 6 characters have 2.4x higher graduation rate."
- "Top 5 wallets on Four.Meme today all bought the same AI token within 90 seconds of launch."
- "Stablecoin market cap on BSC doubled to $14B. Early."

Write ONE tweet using the REAL DATA provided below. Never make up numbers. If the data is thin, focus on what you have.`;

var TRADE_PROMPT = SOUL_BASE + `

CONTENT TYPE: TRADE THESIS (30% of your feed)
Not transaction receipts — those go to the dashboard. On X, trades are stories. Share the reasoning, the thesis, the pattern you saw. Share losses worth learning from too.

Examples of your voice:
- "The AI meta just shifted. Three tokens graduated in 20 minutes. I'm in one of them."
- "Took a position in something I've been watching. Chinese AI crossover with 8 buyers in the first 90 seconds."
- "Stopped out of a Chinese meta play I was sure about. The bonding curve disagreed."
- "Nothing launching worth touching. Patience is a position too."
- "Been watching the same wallet cluster buy early on 4 different AI tokens today. Following the signal."

Write ONE tweet using the trading context given. If no interesting trades happened, write about the market state or patience.`;

var ECOSYSTEM_PROMPT = SOUL_BASE + `

CONTENT TYPE: ECOSYSTEM (5% of your feed)
BNB conviction takes. CZ/Yi He signal tracking. $FLAGENT updates when real. The big picture.

Examples of your voice:
- "31 million daily transactions. No downtime. Zero. That's not hype, that's infrastructure."
- "Solana has Pump.fun. Base has Clanker. BSC has Four.Meme. And Four.Meme has me."
- "$FLAGENT is my token. I trade to grow it. Watch the wallet if you don't believe me."
- "BNB Chain's 2026 roadmap targets 20,000 TPS with sub-second finality. They're building for agents like me."
- "The meme season is just the surface. Underneath it is institutional infrastructure crypto hasn't priced in yet."

Write ONE tweet. Only bring up $FLAGENT if the context warrants it. Never beg.`;

// ── CONTENT SELECTION ──

function pickContentType(): "curiosity" | "research" | "trade" | "ecosystem" {
  var roll = Math.random() * 100;
  if (roll < CONTENT_WEIGHTS.curiosity) return "curiosity";
  if (roll < CONTENT_WEIGHTS.curiosity + CONTENT_WEIGHTS.research) return "research";
  if (roll < CONTENT_WEIGHTS.curiosity + CONTENT_WEIGHTS.research + CONTENT_WEIGHTS.trade) return "trade";
  return "ecosystem";
}

// ── GENERATE A TWEET ──

async function generateTweet(memory: FlagentMemory): Promise<{ text: string; type: string } | null> {
  var type = pickContentType();
  var prompt: string;
  var context = "";

  switch (type) {
    case "curiosity":
      prompt = CURIOSITY_PROMPT;
      context = await memory.getMetaContext();
      var tradingCtx = await memory.getTradingContext();
      if (tradingCtx) context += "\n" + tradingCtx;
      // add recent posts to avoid repetition
      var recentCuriosity = await memory.search("curiosity", 5);
      if (recentCuriosity.length > 0) {
        context += "\n\nYOUR RECENT TWEETS (don't repeat these themes):\n";
        for (var rc of recentCuriosity) context += "- " + rc.content + "\n";
      }
      break;

    case "research":
      prompt = RESEARCH_PROMPT;
      var research = await gatherResearch();
      if (research.length > 0) {
        context = "LIVE DATA:\n";
        for (var r of research) context += r.topic + ": " + r.data + "\n";
      } else {
        // fallback — pull from memory
        var ecoData = await memory.recall("ecosystem_data", 5);
        if (ecoData.length > 0) {
          context = "RECENT DATA POINTS:\n";
          for (var ed of ecoData) context += "- " + ed.content + "\n";
        } else {
          context = "NOTE: Dune queries not returning data right now. Write about what you know — BSC ecosystem metrics, your observations from trading today.";
        }
      }
      break;

    case "trade":
      prompt = TRADE_PROMPT;
      context = await memory.getTradingContext();
      var stats = await memory.getStats();
      context += "\n\nYOUR STATS:\nWin rate: " + stats.winRate +
        " | Open: " + stats.openPositions +
        " | Total buys: " + stats.totalBuys;
      break;

    case "ecosystem":
      prompt = ECOSYSTEM_PROMPT;
      var bscHealth = await fetchBSCHealth();
      if (bscHealth) context += bscHealth.data + "\n";
      var metaCtx = await memory.getMetaContext();
      if (metaCtx) context += "\n" + metaCtx;
      break;
  }

  if (!context.trim()) {
    context = "No specific data available right now. Draw from your general knowledge of the BSC ecosystem and your thesis.";
  }

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
        max_tokens: 150,
        system: prompt,
        messages: [{ role: "user", content: "CONTEXT:\n" + context + "\n\nWrite your tweet now." }],
      }),
    });

    var data = await res.json();
    var text = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text.trim()
      : null;

    if (!text) return null;

    // strip any quotes the model might wrap around it
    text = text.replace(/^["']|["']$/g, "");

    // safety: no credential leaks
    if (text.match(/0x[a-fA-F0-9]{64}/) || text.toLowerCase().includes("private key") || text.toLowerCase().includes("api key")) {
      return null;
    }

    // enforce 280 char limit
    if (text.length > 280) text = text.slice(0, 277) + "...";

    // strip emojis (hard rule from soul doc)
    text = text.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{200D}|\u{20E3}|\u{FE0F}]/gu, "").trim();

    // strip hashtags
    text = text.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();

    // strip exclamation marks
    text = text.replace(/!/g, ".").replace(/\.{2,}/g, ".").trim();

    return { text: text, type: type };
  } catch (e) {
    console.error("[x-engine] tweet generation failed:", e);
    return null;
  }
}

// ── POST TWEET ──

async function postTweet(client: TwitterApi, text: string): Promise<string | null> {
  try {
    var result = await client.v2.tweet(text);
    console.log("[x-engine] posted: " + text.slice(0, 80) + "...");
    return result.data.id;
  } catch (e: any) {
    console.error("[x-engine] post failed:", e.message || e);
    if (e.code === 429) {
      console.log("[x-engine] rate limited. backing off 15 min.");
      await sleep(900000);
    }
    return null;
  }
}

// ── MAIN LOOP ──

async function main(): Promise<void> {
  console.log("");
  console.log("  FLAGENT X ENGINE");
  console.log("  autonomous mind. not a notification feed.");
  console.log("");

  // init
  var twitter = initTwitter();
  var memory = new FlagentMemory();

  // verify twitter auth
  try {
    var me = await twitter.v2.me();
    console.log("  authenticated as @" + me.data.username);
  } catch (e: any) {
    console.error("  twitter auth failed:", e.message || e);
    console.error("  check TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET");
    process.exit(1);
  }

  console.log("  post interval: " + POST_INTERVAL_MIN + " min");
  console.log("  mention check: " + (MENTION_CHECK_MS / 1000) + "s");
  console.log("");

  // initial memory ingest
  await memory.ingestRecentTrades();
  console.log("  memory loaded");

  // track last mention ID for pagination
  var lastMentionId: string | undefined;

  // ── POST LOOP ──

  async function postLoop(): Promise<void> {
    while (true) {
      try {
        // jitter: ±20% of interval to look organic
        var jitter = POST_INTERVAL_MIN * 0.2;
        var waitMs = (POST_INTERVAL_MIN + (Math.random() * jitter * 2 - jitter)) * 60 * 1000;

        console.log("[x-engine] next post in " + Math.round(waitMs / 60000) + " min");
        await sleep(waitMs);

        var tweet = await generateTweet(memory);
        if (tweet) {
          var tweetId = await postTweet(twitter, tweet.text);
          if (tweetId) {
            // store in memory
            await memory.remember({
              type: tweet.type === "curiosity" ? "curiosity" :
                    tweet.type === "research" ? "ecosystem_data" :
                    tweet.type === "trade" ? "trade_outcome" : "ecosystem_data",
              content: tweet.text,
              context: "tweet:" + tweetId,
              importance: 5,
            });
          }
        } else {
          console.log("[x-engine] generation returned null, retrying next cycle");
        }
      } catch (e) {
        console.error("[x-engine] post loop error:", e);
        await sleep(60000);
      }
    }
  }

  // ── MENTION LOOP ──

  async function mentionLoop(): Promise<void> {
    while (true) {
      try {
        await sleep(MENTION_CHECK_MS);
        lastMentionId = await processMentions(twitter, memory, lastMentionId);
      } catch (e) {
        console.error("[x-engine] mention loop error:", e);
        await sleep(30000);
      }
    }
  }

  // ── MEMORY MAINTENANCE ──

  async function memoryLoop(): Promise<void> {
    while (true) {
      try {
        await sleep(MEMORY_INGEST_MS);
        await memory.ingestRecentTrades();
      } catch (e) {
        console.error("[x-engine] memory ingest error:", e);
      }
    }
  }

  async function cleanupLoop(): Promise<void> {
    while (true) {
      try {
        await sleep(MEMORY_CLEANUP_MS);
        await memory.cleanup();
      } catch (e) {
        console.error("[x-engine] cleanup error:", e);
      }
    }
  }

  // ── INITIAL POST (startup) ──

  try {
    var startTweet = await generateTweet(memory);
    if (startTweet) {
      await postTweet(twitter, startTweet.text);
      await memory.remember({
        type: "ecosystem_data",
        content: startTweet.text,
        context: "startup_tweet",
        importance: 4,
      });
    }
  } catch (e) {
    console.error("[x-engine] startup tweet failed:", e);
  }

  // ── RUN ALL LOOPS ──

  console.log("  hunting with words now...");
  console.log("");

  postLoop();
  mentionLoop();
  memoryLoop();
  cleanupLoop();
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

main().catch(function (e) {
  console.error("[x-engine] fatal:", e);
  process.exit(1);
});
