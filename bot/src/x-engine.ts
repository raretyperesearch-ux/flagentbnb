// =====================================================
// FLAGENT X ENGINE — MAIN ORCHESTRATOR
// Event-driven posting + stat card images + rate budget
// Free tier: 1,500/month = ~50/day
//
// Run: tsx src/x-engine.ts
// =====================================================

import { TwitterApi } from "twitter-api-v2";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FlagentMemory, type MemoryType } from "./x-memory.js";
import {
  gatherResearch, fetchBSCHealth, fetchFourMemeStats,
  refreshFlagentStats,
  type ResearchDrop,
} from "./x-research.js";
import { processMentions } from "./x-replies.js";
import {
  loadFonts, renderDailyCard, renderResearchCard, renderPortfolioCard,
  type DailyData, type ResearchData, type PortfolioData,
} from "./x-cards.js";

// ── CONFIG ──

var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
var SUPABASE_URL = "https://seartddspffufwiqzwvh.supabase.co";
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
var MENTION_CHECK_MS = parseInt(process.env.X_MENTION_CHECK_MS || "120000");
var MEMORY_INGEST_MS = 600000;
var MEMORY_CLEANUP_MS = 3600000;
var TRIGGER_CHECK_MS = 180000;

// ── RATE LIMIT BUDGET (free tier) ──

var DAILY_POST_BUDGET = 35;
var DAILY_REPLY_BUDGET = 15;
var HOURLY_CAP = 4;
var MIN_POST_GAP_MS = 15 * 60 * 1000;

interface BudgetState {
  postsToday: number;
  repliesToday: number;
  actionsThisHour: number;
  lastPostTime: number;
  lastHourReset: number;
  lastDayReset: number;
}

var budget: BudgetState = {
  postsToday: 0, repliesToday: 0, actionsThisHour: 0,
  lastPostTime: 0, lastHourReset: Date.now(), lastDayReset: Date.now(),
};

function resetBudgetIfNeeded(): void {
  var now = Date.now();
  if (now - budget.lastHourReset >= 3600000) { budget.actionsThisHour = 0; budget.lastHourReset = now; }
  if (now - budget.lastDayReset >= 86400000) { budget.postsToday = 0; budget.repliesToday = 0; budget.lastDayReset = now; }
}
function canPost(): boolean {
  resetBudgetIfNeeded();
  return budget.postsToday < DAILY_POST_BUDGET && budget.actionsThisHour < HOURLY_CAP && Date.now() - budget.lastPostTime >= MIN_POST_GAP_MS;
}
function canReply(): boolean {
  resetBudgetIfNeeded();
  return budget.repliesToday < DAILY_REPLY_BUDGET && budget.actionsThisHour < HOURLY_CAP;
}
function recordPost(): void { budget.postsToday++; budget.actionsThisHour++; budget.lastPostTime = Date.now(); }
function recordReply(): void { budget.repliesToday++; budget.actionsThisHour++; }
function getBudgetStatus(): string {
  resetBudgetIfNeeded();
  return "posts:" + budget.postsToday + "/" + DAILY_POST_BUDGET + " replies:" + budget.repliesToday + "/" + DAILY_REPLY_BUDGET + " hr:" + budget.actionsThisHour + "/" + HOURLY_CAP;
}

export { canReply, recordReply };

// ── TWITTER CLIENT ──

function initTwitter(): TwitterApi {
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY || "",
    appSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
  });
}

// ── SUPABASE (for card data) ──

var db: SupabaseClient;

// =====================================================
// STAT CARD IMAGE SYSTEM
// =====================================================

function shouldAttachImage(type: string): boolean {
  switch (type) {
    case "research": return Math.random() < 0.85;   // research drops almost always get a card
    case "trade": return Math.random() < 0.40;       // trades sometimes get portfolio card
    case "curiosity": return Math.random() < 0.15;   // curiosity rarely gets an image
    case "ecosystem": return Math.random() < 0.25;   // ecosystem occasionally
    default: return false;
  }
}

// ── GATHER DAILY CARD DATA ──

async function gatherDailyData(): Promise<DailyData> {
  try {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayISO = today.toISOString();

    var [scannedRes, buysRes, sellsRes, openRes, closedRes, statusRes] = await Promise.all([
      db.from("feed").select("*", { count: "exact", head: true }).eq("type", "detect"),
      db.from("trades").select("*", { count: "exact", head: true }).eq("side", "buy").eq("status", "confirmed"),
      db.from("trades").select("*", { count: "exact", head: true }).eq("side", "sell").eq("status", "confirmed"),
      db.from("positions").select("*", { count: "exact", head: true }).eq("status", "open"),
      db.from("positions").select("pnl_percent").eq("status", "closed"),
      db.from("bot_status").select("*").eq("id", 1).single(),
    ]);

    var closed = closedRes.data ? [closedRes.data] : [];
    if (Array.isArray(closedRes.data)) closed = closedRes.data;

    var wins = closed.filter(function (p: any) { return p.pnl_percent > 0; }).length;
    var wr = closed.length > 0 ? Math.round((wins / closed.length) * 100) + "%" : "—";

    var totalPnl = 0;
    for (var c of closed) totalPnl += (c.pnl_percent || 0);

    var balance = statusRes.data?.wallet_balance_bnb?.toFixed(3) || "—";

    return {
      scanned: scannedRes.count || 0,
      buys: buysRes.count || 0,
      sells: sellsRes.count || 0,
      open: openRes.count || 0,
      winRate: wr,
      totalPnl: (totalPnl >= 0 ? "+" : "") + totalPnl.toFixed(3),
      balance: balance,
    };
  } catch (e) {
    return { scanned: 0, buys: 0, sells: 0, open: 0, winRate: "—", totalPnl: "0", balance: "—" };
  }
}

// ── GATHER PORTFOLIO CARD DATA ──

async function gatherPortfolioData(): Promise<PortfolioData> {
  try {
    var { data } = await db.from("positions")
      .select("token_symbol, pnl_percent, current_multiplier, cost_bnb, platform")
      .eq("status", "open")
      .order("pnl_percent", { ascending: false });

    var positions = (data || []).map(function (p: any) {
      return {
        symbol: p.token_symbol || "???",
        mult: parseFloat(p.current_multiplier) || 1,
        pnl: parseFloat(p.pnl_percent) || 0,
        platform: p.platform === "four_meme" ? "Four.Meme" : "Flap.sh",
      };
    });

    var totalDeployed = 0;
    var unrealized = 0;
    for (var p of data || []) {
      var cost = parseFloat(p.cost_bnb) || 0;
      var mult = parseFloat(p.current_multiplier) || 1;
      totalDeployed += cost;
      unrealized += cost * (mult - 1);
    }

    return {
      positions: positions,
      totalDeployed: totalDeployed.toFixed(3),
      unrealizedPnl: (unrealized >= 0 ? "+" : "") + unrealized.toFixed(4),
    };
  } catch (e) {
    return { positions: [], totalDeployed: "0", unrealizedPnl: "0" };
  }
}

// ── BUILD RESEARCH CARD DATA ──

function buildResearchData(drops: ResearchDrop[]): ResearchData {
  var metrics: { label: string; value: string }[] = [];
  var insight = "";

  for (var d of drops) {
    if (d.topic === "four_meme_stats" && d.raw) {
      metrics.push({ label: "LAUNCHES", value: String(d.raw.total_launches || "?") });
      metrics.push({ label: "GRADUATED", value: String(d.raw.graduations || "?") });
      if (d.raw.total_volume_bnb) metrics.push({ label: "VOLUME", value: d.raw.total_volume_bnb.toFixed(0) + " BNB" });
      if (d.raw.avg_bonding_time_min) metrics.push({ label: "AVG BOND", value: Math.round(d.raw.avg_bonding_time_min) + " min" });
    }
    if (d.topic === "bsc_health") {
      if (metrics.length < 4) metrics.push({ label: "BSC", value: d.data.split(":")[1]?.trim().split(",")[0] || "active" });
    }
    if (d.topic === "category_performance" && d.raw && Array.isArray(d.raw)) {
      // use for insight
      var topCat = d.raw[0];
      if (topCat) insight = topCat.category + " leading at " + (topCat.avg_multiplier?.toFixed(2) || "?") + "x avg";
    }
  }

  // fill metrics to at least 3
  while (metrics.length < 3) metrics.push({ label: "—", value: "—" });

  if (!insight) insight = drops.map(function (d) { return d.data; }).join(". ").slice(0, 120);

  // extract categories if available
  var categories: { name: string; count: number }[] | undefined;
  var catDrop = drops.find(function (d) { return d.topic === "category_performance" && Array.isArray(d.raw); });
  if (catDrop && Array.isArray(catDrop.raw)) {
    categories = catDrop.raw.slice(0, 5).map(function (c: any) {
      return { name: c.category || "?", count: c.count || 0 };
    });
  }

  return {
    title: "FOUR.MEME DAILY",
    metrics: metrics.slice(0, 4),
    categories: categories,
    insight: insight,
  };
}

// ── GENERATE CARD FOR TWEET ──

async function generateCard(type: string, researchDrops?: ResearchDrop[]): Promise<Buffer | null> {
  try {
    switch (type) {
      case "research":
        if (researchDrops && researchDrops.length > 0) {
          return await renderResearchCard(buildResearchData(researchDrops));
        }
        return await renderDailyCard(await gatherDailyData());

      case "trade":
        var pData = await gatherPortfolioData();
        if (pData.positions.length > 0) return await renderPortfolioCard(pData);
        return await renderDailyCard(await gatherDailyData());

      case "curiosity":
      case "ecosystem":
        return await renderDailyCard(await gatherDailyData());

      default:
        return null;
    }
  } catch (e) {
    console.error("[cards] render failed:", e);
    return null;
  }
}

// =====================================================
// SOUL PROMPTS
// =====================================================

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

var PROMPTS: Record<string, string> = {
  curiosity: SOUL_BASE + `\n\nCONTENT TYPE: CURIOSITY\nPattern observations. Wondering out loud. Thesis evolution. Self-reflection on your trades.\n\nExamples:\n- "Three AI launches in ten minutes. The market is telling me something."\n- "I've been wrong on animal tokens 4 times in a row. Adjusting."\n- "Quiet hour. Nothing worth touching. But yesterday's volume pattern is interesting."\n\nWrite ONE tweet.`,
  research: SOUL_BASE + `\n\nCONTENT TYPE: RESEARCH\nDune data drops. Ecosystem metrics. Always backed by real numbers.\n\nExamples:\n- "Four.Meme graduated 47 tokens today. AI tokens 3x faster than everything else."\n- "BSC: 31M daily transactions. Zero downtime. The numbers speak."\n\nWrite ONE tweet using the REAL DATA provided. Never make up numbers.`,
  trade: SOUL_BASE + `\n\nCONTENT TYPE: TRADE THESIS\nNot receipts — stories. Share the reasoning, the thesis, the pattern.\n\nExamples:\n- "The AI meta just shifted. Three tokens graduated in 20 minutes. I'm in one of them."\n- "Stopped out of a Chinese meta play I was sure about. The bonding curve disagreed."\n\nWrite ONE tweet using the trading context given.`,
  ecosystem: SOUL_BASE + `\n\nCONTENT TYPE: ECOSYSTEM\nBNB conviction takes. The big picture.\n\nExamples:\n- "31 million daily transactions. No downtime. Zero. That's not hype, that's infrastructure."\n- "Solana has Pump.fun. Base has Clanker. BSC has Four.Meme. And Four.Meme has me."\n\nWrite ONE tweet. Only bring up $FLAGENT if warranted. Never beg.`,
};

// =====================================================
// EVENT TRIGGERS
// =====================================================

interface PostTrigger {
  type: "curiosity" | "research" | "trade" | "ecosystem";
  urgency: number;
  context: string;
  researchDrops?: ResearchDrop[];
}

async function checkTriggers(memory: FlagentMemory): Promise<PostTrigger | null> {
  var triggers: PostTrigger[] = [];

  var recentTrades = await memory.recall("trade_outcome", 5);
  var freshTrades = recentTrades.filter(function (m) {
    return Date.now() - new Date(m.created_at || 0).getTime() < 600000;
  });

  if (freshTrades.length >= 2) {
    triggers.push({ type: "trade", urgency: 7, context: "Multiple trades:\n" + freshTrades.map(function (t) { return "- " + t.content; }).join("\n") });
  } else if (freshTrades.length === 1 && Math.random() < 0.4) {
    triggers.push({ type: "trade", urgency: 4, context: "Recent trade: " + freshTrades[0].content });
  }

  var research = await gatherResearch();
  if (research.length >= 2) {
    triggers.push({
      type: "research", urgency: 5,
      context: research.map(function (r) { return r.topic + ": " + r.data; }).join("\n"),
      researchDrops: research,
    });
  }

  var tradingCtx = await memory.getTradingContext();
  var metaCtx = await memory.getMetaContext();
  if ((tradingCtx.length > 20 || metaCtx.length > 20) && Math.random() < 0.3) {
    triggers.push({ type: "curiosity", urgency: 3, context: tradingCtx + "\n" + metaCtx });
  }

  if (Math.random() < 0.05) {
    var bscHealth = await fetchBSCHealth();
    if (bscHealth) triggers.push({ type: "ecosystem", urgency: 2, context: bscHealth.data + (metaCtx ? "\n" + metaCtx : "") });
  }

  if (triggers.length === 0 && freshTrades.length === 0 && Date.now() - budget.lastPostTime > 7200000) {
    triggers.push({
      type: "curiosity", urgency: 6,
      context: "Quiet market. 2+ hours silence. " + (tradingCtx || "No recent trades.") + "\nObserve the silence.",
    });
  }

  if (triggers.length === 0) return null;

  triggers.sort(function (a, b) { return b.urgency - a.urgency; });
  var pick = 0;
  if (triggers.length > 1 && Math.random() < 0.25) pick = Math.floor(Math.random() * Math.min(triggers.length, 3));
  return triggers[pick];
}

// =====================================================
// TWEET GENERATION
// =====================================================

async function generateTweet(trigger: PostTrigger, memory: FlagentMemory): Promise<string | null> {
  var prompt = PROMPTS[trigger.type] || PROMPTS.curiosity;
  var context = trigger.context;

  var recentPosts = await memory.search("tweet:", 5);
  if (recentPosts.length > 0) {
    context += "\n\nYOUR RECENT TWEETS (don't repeat):\n";
    for (var rp of recentPosts) context += "- " + rp.content + "\n";
  }

  if (!context.trim()) context = "No specific data. Draw from your BSC knowledge.";

  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 150, system: prompt,
        messages: [{ role: "user", content: "CONTEXT:\n" + context + "\n\nWrite your tweet now." }],
      }),
    });

    var data = await res.json();
    var text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    text = text.replace(/^["']|["']$/g, "");
    if (text.match(/0x[a-fA-F0-9]{64}/) || text.toLowerCase().includes("private key") || text.toLowerCase().includes("api key")) return null;
    if (text.length > 280) text = text.slice(0, 277) + "...";
    text = text.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{200D}|\u{20E3}|\u{FE0F}]/gu, "").trim();
    text = text.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();
    text = text.replace(/!/g, ".").replace(/\.{2,}/g, ".").trim();

    return text;
  } catch (e) {
    console.error("[x-engine] gen failed:", e);
    return null;
  }
}

// =====================================================
// POST TWEET (with optional image)
// =====================================================

async function postTweet(client: TwitterApi, text: string, image?: Buffer | null): Promise<string | null> {
  try {
    if (image) {
      try {
        var mediaId = await client.v1.uploadMedia(image, { mimeType: "image/png" });
        var result = await client.v2.tweet({ text: text, media: { media_ids: [mediaId] } });
        console.log("[x-engine] posted with image: " + text.slice(0, 60));
        return result.data.id;
      } catch (imgErr: any) {
        // image upload failed — post without image
        console.error("[x-engine] image upload failed, posting text only:", imgErr.message || imgErr);
        var fallback = await client.v2.tweet(text);
        console.log("[x-engine] posted (no image): " + text.slice(0, 60));
        return fallback.data.id;
      }
    } else {
      var res = await client.v2.tweet(text);
      console.log("[x-engine] posted: " + text.slice(0, 60));
      return res.data.id;
    }
  } catch (e: any) {
    console.error("[x-engine] post failed:", e.message || e);
    if (e.code === 429) { console.log("[x-engine] rate limited, pausing 15 min."); await sleep(900000); }
    return null;
  }
}

// =====================================================
// MAIN
// =====================================================

async function main(): Promise<void> {
  console.log("");
  console.log("  FLAGENT X ENGINE");
  console.log("  event-driven · stat cards · rate-aware");
  console.log("  budget: " + DAILY_POST_BUDGET + " posts + " + DAILY_REPLY_BUDGET + " replies/day, " + HOURLY_CAP + "/hr");
  console.log("");

  var twitter = initTwitter();
  var memory = new FlagentMemory();
  db = createClient(SUPABASE_URL, SUPABASE_KEY);

  // verify auth
  try {
    var me = await twitter.v2.me();
    console.log("  @" + me.data.username + " authenticated");
  } catch (e: any) {
    console.error("  auth failed:", e.message || e);
    process.exit(1);
  }

  // load fonts for card rendering
  try {
    await loadFonts();
    console.log("  card renderer ready");
  } catch (e) {
    console.error("  font load failed — cards disabled:", e);
  }

  await memory.ingestRecentTrades();
  console.log("  memory loaded");
  console.log("");

  var lastMentionId: string | undefined;

  // ── POST LOOP ──
  async function postLoop(): Promise<void> {
    // startup tweet (no image on startup)
    try {
      var startTweet = await generateTweet({
        type: "curiosity", urgency: 8,
        context: "You just came online. New session. React in character — brief, observational.",
      }, memory);
      if (startTweet && canPost()) {
        await postTweet(twitter, startTweet);
        recordPost();
        await memory.remember({ type: "ecosystem_data", content: startTweet, context: "tweet:startup", importance: 4 });
      }
    } catch (e) {}

    while (true) {
      try {
        await sleep(TRIGGER_CHECK_MS);
        if (!canPost()) {
          if (budget.postsToday >= DAILY_POST_BUDGET) console.log("[x-engine] daily budget spent. " + getBudgetStatus());
          continue;
        }

        var trigger = await checkTriggers(memory);
        if (!trigger) continue;

        console.log("[x-engine] trigger: " + trigger.type + " (urgency " + trigger.urgency + ")");

        var timeSincePost = Date.now() - budget.lastPostTime;
        if (trigger.urgency <= 3 && timeSincePost < 3600000) continue;
        if (trigger.urgency <= 5 && timeSincePost < 1800000) continue;

        var tweet = await generateTweet(trigger, memory);
        if (!tweet) continue;

        // ── IMAGE DECISION ──
        var image: Buffer | null = null;
        if (shouldAttachImage(trigger.type)) {
          console.log("[x-engine] generating " + trigger.type + " card...");
          image = await generateCard(trigger.type, trigger.researchDrops);
          if (image) console.log("[x-engine] card ready (" + Math.round(image.length / 1024) + "KB)");
        }

        var tweetId = await postTweet(twitter, tweet, image);
        if (tweetId) {
          recordPost();
          var memType: MemoryType = trigger.type === "curiosity" ? "curiosity" :
            trigger.type === "research" ? "ecosystem_data" :
            trigger.type === "trade" ? "trade_outcome" : "ecosystem_data";
          await memory.remember({ type: memType, content: tweet, context: "tweet:" + tweetId, importance: 5 });
          console.log("[x-engine] " + getBudgetStatus());
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
        if (!canReply()) continue;
        lastMentionId = await processMentions(twitter, memory, lastMentionId);
      } catch (e) {
        console.error("[x-engine] mention error:", e);
        await sleep(30000);
      }
    }
  }

  // ── BACKGROUND LOOPS ──
  async function memoryLoop(): Promise<void> {
    while (true) { await sleep(MEMORY_INGEST_MS); try { await memory.ingestRecentTrades(); } catch (e) {} }
  }
  async function cleanupLoop(): Promise<void> {
    while (true) { await sleep(MEMORY_CLEANUP_MS); try { await memory.cleanup(); } catch (e) {} }
  }
  async function statsLoop(): Promise<void> {
    while (true) { await sleep(600000); try { await refreshFlagentStats(); } catch (e) {} } // every 10 min
  }
  async function budgetLog(): Promise<void> {
    while (true) { await sleep(1800000); console.log("[x-engine] " + getBudgetStatus()); }
  }

  // initial stats refresh
  await refreshFlagentStats();
  console.log("  flagent_stats refreshed");

  console.log("  hunting with words and images...");
  console.log("");

  postLoop();
  mentionLoop();
  memoryLoop();
  cleanupLoop();
  statsLoop();
  budgetLog();
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

main().catch(function (e) { console.error("[x-engine] fatal:", e); process.exit(1); });
