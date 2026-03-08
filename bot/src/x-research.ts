// =====================================================
// FLAGENT X ENGINE — RESEARCH (DUNE INTEGRATION)
// Pulls on-chain data for research drops
// =====================================================

var DUNE_API_KEY = process.env.DUNE_API_KEY || "";
var DUNE_BASE = "https://api.dune.com/api/v1";

interface DuneResult {
  rows: any[];
  metadata?: any;
}

async function duneQuery(queryId: number, params?: Record<string, string>): Promise<DuneResult | null> {
  if (!DUNE_API_KEY) return null;

  try {
    // execute query
    var execBody: any = {};
    if (params) {
      execBody.query_parameters = params;
    }

    var execRes = await fetch(DUNE_BASE + "/query/" + queryId + "/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DUNE-API-KEY": DUNE_API_KEY,
      },
      body: JSON.stringify(execBody),
    });

    var execData = await execRes.json();
    var executionId = execData.execution_id;
    if (!executionId) return null;

    // poll for results (max 60s)
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
        return { rows: resultData.result?.rows || [], metadata: resultData.result?.metadata };
      }

      if (statusData.state === "QUERY_STATE_FAILED") {
        console.error("[dune] query " + queryId + " failed:", statusData.error);
        return null;
      }
    }

    return null;
  } catch (e) {
    console.error("[dune] query failed:", e);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ── RESEARCH QUERIES ──
// These query IDs need to be set up in Dune. Placeholder IDs below —
// replace with your actual saved query IDs.

export interface ResearchDrop {
  topic: string;
  data: string;
  raw?: any;
}

// BSC daily transaction count + active addresses
export async function fetchBSCHealth(): Promise<ResearchDrop | null> {
  // Query: BSC daily txn count, active addresses, gas price avg
  // Replace with your actual Dune query ID
  var QUERY_ID = parseInt(process.env.DUNE_QUERY_BSC_HEALTH || "0");
  if (!QUERY_ID) {
    // Fallback: use BscScan API for basic stats
    return await fetchBSCHealthFallback();
  }

  var result = await duneQuery(QUERY_ID);
  if (!result || result.rows.length === 0) return null;

  var row = result.rows[0];
  return {
    topic: "bsc_health",
    data: "BSC today: " + formatNum(row.txn_count) + " transactions, " +
      formatNum(row.active_addresses) + " active addresses" +
      (row.avg_gas ? ", avg gas " + row.avg_gas.toFixed(2) + " Gwei" : ""),
    raw: row,
  };
}

async function fetchBSCHealthFallback(): Promise<ResearchDrop | null> {
  try {
    // Use public BNB Chain stats endpoint
    var res = await fetch("https://api.bscscan.com/api?module=proxy&action=eth_blockNumber&apikey=YourApiKeyToken");
    var data = await res.json();
    if (data.result) {
      var blockNum = parseInt(data.result, 16);
      return {
        topic: "bsc_health",
        data: "BSC block height: " + blockNum.toLocaleString() + ". Chain running.",
        raw: { blockNumber: blockNum },
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Four.Meme volume + graduation stats
export async function fetchFourMemeStats(): Promise<ResearchDrop | null> {
  var QUERY_ID = parseInt(process.env.DUNE_QUERY_FOURMEME || "0");
  if (!QUERY_ID) return null;

  var result = await duneQuery(QUERY_ID);
  if (!result || result.rows.length === 0) return null;

  var row = result.rows[0];
  var parts: string[] = [];

  if (row.total_launches) parts.push(formatNum(row.total_launches) + " launches");
  if (row.graduations) parts.push(row.graduations + " graduated");
  if (row.total_volume_bnb) parts.push(row.total_volume_bnb.toFixed(1) + " BNB volume");
  if (row.avg_bonding_time_min) parts.push("avg bonding " + Math.round(row.avg_bonding_time_min) + " min");

  return {
    topic: "four_meme_stats",
    data: "Four.Meme today: " + parts.join(", "),
    raw: row,
  };
}

// Token category performance (AI vs animal vs Chinese vs political)
export async function fetchCategoryPerformance(): Promise<ResearchDrop | null> {
  var QUERY_ID = parseInt(process.env.DUNE_QUERY_CATEGORIES || "0");
  if (!QUERY_ID) return null;

  var result = await duneQuery(QUERY_ID);
  if (!result || result.rows.length === 0) return null;

  var lines: string[] = [];
  for (var row of result.rows) {
    if (row.category && row.avg_multiplier) {
      lines.push(row.category + ": " + row.avg_multiplier.toFixed(2) + "x avg (" + row.count + " tokens)");
    }
  }

  return {
    topic: "category_performance",
    data: "Category performance today:\n" + lines.join("\n"),
    raw: result.rows,
  };
}

// Top performing wallets on Four.Meme
export async function fetchSmartMoney(): Promise<ResearchDrop | null> {
  var QUERY_ID = parseInt(process.env.DUNE_QUERY_SMART_MONEY || "0");
  if (!QUERY_ID) return null;

  var result = await duneQuery(QUERY_ID);
  if (!result || result.rows.length === 0) return null;

  var topWallets = result.rows.slice(0, 5);
  var summary = topWallets.length + " wallets with " +
    topWallets.filter(function (w: any) { return w.win_rate > 60; }).length +
    " above 60% win rate in the last 24h";

  return {
    topic: "smart_money",
    data: summary,
    raw: topWallets,
  };
}

// Flap.sh stats
export async function fetchFlapStats(): Promise<ResearchDrop | null> {
  var QUERY_ID = parseInt(process.env.DUNE_QUERY_FLAP || "0");
  if (!QUERY_ID) return null;

  var result = await duneQuery(QUERY_ID);
  if (!result || result.rows.length === 0) return null;

  var row = result.rows[0];
  return {
    topic: "flap_stats",
    data: "Flap.sh: " + (row.launches || "?") + " launches, " +
      (row.volume_bnb ? row.volume_bnb.toFixed(1) + " BNB volume" : "volume unknown"),
    raw: row,
  };
}

// ── AGGREGATE RESEARCH FOR A TWEET ──

export async function gatherResearch(): Promise<ResearchDrop[]> {
  var drops: ResearchDrop[] = [];

  var results = await Promise.allSettled([
    fetchBSCHealth(),
    fetchFourMemeStats(),
    fetchCategoryPerformance(),
    fetchSmartMoney(),
    fetchFlapStats(),
  ]);

  for (var r of results) {
    if (r.status === "fulfilled" && r.value) {
      drops.push(r.value);
    }
  }

  return drops;
}

// ── LIVE TOKEN LOOKUP (for reply analytics) ──

export async function lookupToken(address: string): Promise<string | null> {
  try {
    // GoPlus security
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
      if (secInfo.is_honeypot !== "1" && secInfo.is_mintable !== "1" && maxTax <= 0.1) {
        parts.push("security clean");
      }
    }

    return parts.length > 0 ? parts.join(". ") : null;
  } catch (e) {
    return null;
  }
}

// ── HELPERS ──

function formatNum(n: number): string {
  if (!n) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
}
