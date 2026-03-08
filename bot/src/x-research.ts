// =====================================================
// FLAGENT X ENGINE — RESEARCH (DUNE → SUPABASE CACHE)
// Fetches Dune data, caches in Supabase, reads from cache
// Tables: dune_cache, analytics_snapshots, flagent_stats
// =====================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

var DUNE_API_KEY = process.env.DUNE_API_KEY || "";
var DUNE_BASE = "https://api.dune.com/api/v1";
var SUPABASE_URL = "https://seartddspffufwiqzwvh.supabase.co";
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
var CACHE_TTL_MS = 30 * 60 * 1000; // 30 min cache

var db: SupabaseClient;

function getDb(): SupabaseClient {
  if (!db) db = createClient(SUPABASE_URL, SUPABASE_KEY);
  return db;
}

// ── DUNE QUERY EXECUTION ──

async function duneQuery(queryId: number): Promise<any[] | null> {
  if (!DUNE_API_KEY || !queryId) return null;

  try {
    var execRes = await fetch(DUNE_BASE + "/query/" + queryId + "/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-DUNE-API-KEY": DUNE_API_KEY },
      body: JSON.stringify({}),
    });
    var execData = await execRes.json();
    var executionId = execData.execution_id;
    if (!executionId) return null;

    for (var attempt = 0; attempt < 20; attempt++) {
      await sleep(3000);
      var statusRes = await fetch(DUNE_BASE + "/execution/" + executionId + "/status", {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY },
      });
      var statusData = await statusRes.json();

      if (statusData.state === "QUERY_STATE_COMPLETED") {
        var resultRes = await fetch(DUNE_BASE + "/execution/" + executionId + "/results?limit=50", {
          headers: { "X-DUNE-API-KEY": DUNE_API_KEY },
        });
        var resultData = await resultRes.json();
        return resultData.result?.rows || [];
      }
      if (statusData.state === "QUERY_STATE_FAILED") return null;
    }
    return null;
  } catch (e) {
    console.error("[research] dune query failed:", e);
    return null;
  }
}

// ── SUPABASE CACHE ──

async function getCached(queryName: string): Promise<any | null> {
  try {
    var { data } = await getDb()
      .from("dune_cache")
      .select("result, expires_at")
      .eq("query_name", queryName)
      .single();

    if (data && new Date(data.expires_at) > new Date()) {
      return data.result;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function setCache(queryName: string, result: any, ttlMs: number = CACHE_TTL_MS): Promise<void> {
  try {
    var expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await getDb().from("dune_cache").upsert({
      query_name: queryName,
      result: result,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: "query_name" });
  } catch (e) {}
}

// ── FETCH WITH CACHE ──

async function fetchWithCache(queryName: string, queryId: number, ttlMs?: number): Promise<any | null> {
  // try cache first
  var cached = await getCached(queryName);
  if (cached) {
    console.log("[research] cache hit: " + queryName);
    return cached;
  }

  // fetch from Dune
  console.log("[research] fetching from Dune: " + queryName);
  var rows = await duneQuery(queryId);
  if (rows && rows.length > 0) {
    await setCache(queryName, rows, ttlMs);
    return rows;
  }
  return null;
}

// ── QUERY IDS FROM ENV ──

function qid(envVar: string): number {
  return parseInt(process.env[envVar] || "0");
}

// =====================================================
// RESEARCH FETCHERS
// =====================================================

export interface ResearchDrop {
  topic: string;
  data: string;
  raw?: any;
}

// ── BSC ECOSYSTEM HEALTH ──

export async function fetchBSCHealth(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_BSC_HEALTH");
  if (!id) return await fetchBSCHealthFallback();

  var rows = await fetchWithCache("bsc_health", id, 60 * 60 * 1000); // 1hr cache
  if (!rows || rows.length === 0) return await fetchBSCHealthFallback();

  var row = rows[0];
  var data = "BSC yesterday: " + formatNum(row.txn_count) + " transactions, " +
    formatNum(row.active_addresses) + " active addresses" +
    (row.avg_gas_gwei ? ", avg gas " + row.avg_gas_gwei.toFixed(2) + " Gwei" : "");

  // store snapshot
  await storeSnapshot("bsc_health", row);

  return { topic: "bsc_health", data: data, raw: row };
}

async function fetchBSCHealthFallback(): Promise<ResearchDrop | null> {
  try {
    var res = await fetch("https://api.bscscan.com/api?module=proxy&action=eth_blockNumber&apikey=YourApiKeyToken");
    var data = await res.json();
    if (data.result) {
      var blockNum = parseInt(data.result, 16);
      return { topic: "bsc_health", data: "BSC block height: " + blockNum.toLocaleString(), raw: { blockNumber: blockNum } };
    }
    return null;
  } catch (e) { return null; }
}

// ── FOUR.MEME STATS ──

export async function fetchFourMemeStats(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_FOURMEME");
  if (!id) return null;

  var rows = await fetchWithCache("four_meme_stats", id);
  if (!rows || rows.length === 0) return null;

  var row = rows[0];
  var parts: string[] = [];
  if (row.total_txns) parts.push(formatNum(row.total_txns) + " transactions");
  if (row.unique_traders) parts.push(formatNum(row.unique_traders) + " unique traders");
  if (row.total_volume_bnb) parts.push(row.total_volume_bnb.toFixed(1) + " BNB volume");
  if (row.total_launches) parts.push(formatNum(row.total_launches) + " launches");
  if (row.avg_trade_bnb) parts.push("avg trade " + row.avg_trade_bnb.toFixed(3) + " BNB");

  await storeSnapshot("four_meme", row);

  return {
    topic: "four_meme_stats",
    data: "Four.Meme today: " + parts.join(", "),
    raw: row,
  };
}

// ── CATEGORY PERFORMANCE ──

export async function fetchCategoryPerformance(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_CATEGORIES");
  if (!id) return null;

  var rows = await fetchWithCache("category_performance", id);
  if (!rows || rows.length === 0) return null;

  var lines: string[] = [];
  for (var row of rows) {
    if (row.category && row.avg_multiplier) {
      lines.push(row.category + ": " + row.avg_multiplier.toFixed(2) + "x avg (" + row.count + " tokens)");
    }
  }

  return {
    topic: "category_performance",
    data: "Category performance:\n" + lines.join("\n"),
    raw: rows,
  };
}

// ── SMART MONEY ──

export async function fetchSmartMoney(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_SMART_MONEY");
  if (!id) return null;

  var rows = await fetchWithCache("smart_money", id);
  if (!rows || rows.length === 0) return null;

  var topCount = Math.min(rows.length, 5);
  var heavyTraders = rows.filter(function (w: any) { return w.txn_count >= 5; });

  return {
    topic: "smart_money",
    data: topCount + " top wallets on Four.Meme in last 24h. " +
      heavyTraders.length + " with 5+ trades. " +
      "Largest: " + formatNum(rows[0].total_bnb) + " BNB deployed.",
    raw: rows.slice(0, 5),
  };
}

// ── FLAGENT PERFORMANCE (from Dune — on-chain verified) ──

export async function fetchFlagentOnChain(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_FLAGENT_PERFORMANCE");
  if (!id) return null;

  var rows = await fetchWithCache("flagent_onchain", id, 60 * 60 * 1000);
  if (!rows || rows.length === 0) return null;

  var row = rows[0];
  return {
    topic: "flagent_performance",
    data: "On-chain verified: " + row.total_txns + " transactions, " +
      row.buys + " buys, " + (row.total_bnb_spent?.toFixed(2) || "?") + " BNB deployed. " +
      "Active " + row.active_days + " days. " +
      "Four.Meme: " + row.four_meme_txns + " | Flap.sh: " + row.flap_txns,
    raw: row,
  };
}

// ── FLAP.SH STATS ──

export async function fetchFlapStats(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_FLAP");
  if (!id) return null;

  var rows = await fetchWithCache("flap_stats", id);
  if (!rows || rows.length === 0) return null;

  var row = rows[0];
  return {
    topic: "flap_stats",
    data: "Flap.sh: " + formatNum(row.total_txns) + " transactions, " +
      formatNum(row.unique_traders) + " traders, " +
      (row.total_volume_bnb?.toFixed(1) || "?") + " BNB volume",
    raw: row,
  };
}

// ── CHAIN COMPARE ──

export async function fetchChainCompare(): Promise<ResearchDrop | null> {
  var id = qid("DUNE_QUERY_CHAIN_COMPARE");
  if (!id) return null;

  var rows = await fetchWithCache("chain_compare", id, 60 * 60 * 1000);
  if (!rows || rows.length === 0) return null;

  var lines: string[] = [];
  for (var row of rows) {
    lines.push(row.chain + ": " + formatNum(row.txns) + " txns/24h");
  }

  return {
    topic: "chain_compare",
    data: "24h transactions:\n" + lines.join("\n"),
    raw: rows,
  };
}

// ── FLAGENT STATS FROM SUPABASE (always available, no Dune needed) ──

export async function fetchFlagentStats(): Promise<ResearchDrop | null> {
  try {
    var { data } = await getDb().from("flagent_stats").select("*").eq("id", 1).single();
    if (!data) return null;

    return {
      topic: "flagent_stats",
      data: "Flagent: " + data.tokens_scanned + " scanned, " +
        data.total_buys + " buys, " + data.wins + " wins / " + data.losses + " losses (" +
        data.win_rate + "% win rate). Best: +" + data.best_trade_pnl + "%. " +
        data.total_bnb_deployed + " BNB deployed total.",
      raw: data,
    };
  } catch (e) { return null; }
}

// ── REFRESH FLAGENT_STATS (call periodically from x-engine) ──

export async function refreshFlagentStats(): Promise<void> {
  try {
    await getDb().rpc("refresh_flagent_stats_inline", {});
  } catch (e) {
    // fallback: do it manually
    try {
      await getDb().from("flagent_stats").update({
        tokens_scanned: 0, // will be set by raw query
        updated_at: new Date().toISOString(),
      }).eq("id", 1);

      // use execute_sql equivalent through supabase-js? No — just update via counts
      // The x-engine will call this, and the actual numbers come from the tables
      var [scannedRes, buysRes, sellsRes, openRes, closedRes, winsRes] = await Promise.all([
        getDb().from("feed").select("*", { count: "exact", head: true }).eq("type", "detect"),
        getDb().from("trades").select("*", { count: "exact", head: true }).eq("side", "buy").eq("status", "confirmed"),
        getDb().from("trades").select("*", { count: "exact", head: true }).eq("side", "sell").eq("status", "confirmed"),
        getDb().from("positions").select("*", { count: "exact", head: true }).eq("status", "open"),
        getDb().from("positions").select("pnl_percent", { count: "exact", head: true }).eq("status", "closed"),
        getDb().from("positions").select("pnl_percent").eq("status", "closed").gt("pnl_percent", 0),
      ]);

      var totalClosed = closedRes.count || 0;
      var totalWins = (winsRes.data || []).length;
      var wr = totalClosed > 0 ? Math.round((totalWins / totalClosed) * 100 * 100) / 100 : 0;

      await getDb().from("flagent_stats").update({
        tokens_scanned: scannedRes.count || 0,
        total_buys: buysRes.count || 0,
        total_sells: sellsRes.count || 0,
        open_positions: openRes.count || 0,
        closed_positions: totalClosed,
        wins: totalWins,
        losses: totalClosed - totalWins,
        win_rate: wr,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);

      console.log("[research] flagent_stats refreshed");
    } catch (e2) {
      console.error("[research] stats refresh failed:", e2);
    }
  }
}

// =====================================================
// AGGREGATE RESEARCH
// =====================================================

export async function gatherResearch(): Promise<ResearchDrop[]> {
  var drops: ResearchDrop[] = [];

  // Always include Flagent's own stats (from Supabase, instant)
  var selfStats = await fetchFlagentStats();
  if (selfStats) drops.push(selfStats);

  // Dune-powered (cached in Supabase)
  var results = await Promise.allSettled([
    fetchBSCHealth(),
    fetchFourMemeStats(),
    fetchSmartMoney(),
    fetchFlapStats(),
    fetchFlagentOnChain(),
    fetchChainCompare(),
    fetchCategoryPerformance(),
  ]);

  for (var r of results) {
    if (r.status === "fulfilled" && r.value) drops.push(r.value);
  }

  return drops;
}

// =====================================================
// TOKEN LOOKUP (for reply analytics)
// =====================================================

export async function lookupToken(address: string): Promise<string | null> {
  try {
    var secRes = await fetch("https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=" + address);
    var secData = await secRes.json();
    var secInfo = secData.result ? secData.result[address.toLowerCase()] : null;

    var parts: string[] = [];

    if (secInfo) {
      parts.push(secInfo.token_name + " (" + secInfo.token_symbol + ")");
      if (secInfo.holder_count) parts.push(secInfo.holder_count + " holders");
      if (secInfo.is_honeypot === "1") parts.push("HONEYPOT");
      if (secInfo.is_mintable === "1") parts.push("MINTABLE");
      var maxTax = Math.max(parseFloat(secInfo.buy_tax || "0"), parseFloat(secInfo.sell_tax || "0"));
      if (maxTax > 0) parts.push("tax " + (maxTax * 100).toFixed(0) + "%");
      if (secInfo.is_honeypot !== "1" && secInfo.is_mintable !== "1" && maxTax <= 0.1) parts.push("security clean");
    }

    return parts.length > 0 ? parts.join(". ") : null;
  } catch (e) { return null; }
}

// =====================================================
// ANALYTICS SNAPSHOT (daily persistence)
// =====================================================

async function storeSnapshot(source: string, metrics: any): Promise<void> {
  try {
    var today = new Date().toISOString().split("T")[0];
    await getDb().from("analytics_snapshots").upsert({
      day: today,
      source: source,
      metrics: metrics,
    }, { onConflict: "day,source" });
  } catch (e) {}
}

// Get historical snapshots for trend comparison
export async function getSnapshots(source: string, days: number = 7): Promise<any[]> {
  try {
    var since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    var { data } = await getDb()
      .from("analytics_snapshots")
      .select("day, metrics")
      .eq("source", source)
      .gte("day", since)
      .order("day", { ascending: false });
    return data || [];
  } catch (e) { return []; }
}

// ── HELPERS ──

function formatNum(n: number): string {
  if (!n) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}
