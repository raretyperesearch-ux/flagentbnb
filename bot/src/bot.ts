import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "@supabase/supabase-js";

// --------------- CONFIG ---------------

var PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
var BSC_RPC = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org";
var SUPABASE_URL = "https://seartddspffufwiqzwvh.supabase.co";
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
var BUY_AMOUNT = process.env.BUY_AMOUNT_BNB || "0.01";
var MAX_POS = parseInt(process.env.MAX_POSITIONS || "5");
var TP1 = parseFloat(process.env.TAKE_PROFIT_1 || "1.5");
var TP2 = parseFloat(process.env.TAKE_PROFIT_2 || "2.0");
var SL = parseFloat(process.env.STOP_LOSS || "0.6");
var TIME_STOP = parseInt(process.env.TIME_STOP_MINUTES || "30");
var MONITOR_MS = 10000;
var HEARTBEAT_MS = 30000;

// --------------- CONTRACTS ---------------
// Source: Four.Meme official docs API-Documents.03-03-2026.md

// TokenManager2 (V2) — for buying and selling V2 tokens
// Address on BSC per official docs
var FM_TM2: Address = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";

// TokenManagerHelper3 (V3) — for getTokenInfo, tryBuy, trySell
// Address on BSC per official docs
var FM_HELPER: Address = "0xF251F83e40a78868FcfA3FA4599Dad6494E46034";

// Flap.sh Portal
var FLAP_PORTAL: Address = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";

var ZERO_ADDR: Address = "0x0000000000000000000000000000000000000000";
var EMPTY_BYTES: Hex = "0x";

// Scam name filter — tokens naming themselves after real tokens
var SCAM_NAMES = ["usdt", "usdc", "busd", "wbnb", "btcb", "eth", "bnb", "dai", "cake", "uni", "weth", "bitcoin", "ethereum"];

// Known addresses to skip
var SKIP_ADDRS = [
  "0x55d398326f99059ff775485246999027b3197955",
  "0xe9e7cea3dedca5984780bafc599bd69add087d56",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
];

// =====================================================
// ABIs — EXACT from official TokenManager2.lite.abi
// =====================================================

// V2 buyTokenAMAP — 3 params (address, uint256, uint256)
// From official ABI lines 1105-1127
// Docs: "buyTokenAMAP(address token, uint256 funds, uint256 minAmount)"
//   token: Token address
//   funds: Amount of quote (BNB)
//   minAmount: Minimum tokens to receive (0 for no slippage protection)
var FM_BUY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "funds", type: "uint256" },
      { internalType: "uint256", name: "minAmount", type: "uint256" },
    ],
    name: "buyTokenAMAP",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// V2 sellToken — 2 params (address, uint256)
// From official ABI lines 2141-2158
// Docs: "sellToken(address token, uint256 amount)"
// Note: Must call ERC20.approve(tokenManager, amount) BEFORE calling sellToken
var FM_SELL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "sellToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// V2 TokenPurchase event — 8 fields, ALL non-indexed
// From official ABI lines 284-337
var FM_PURCHASE_EVENT = [
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "address", name: "account", type: "address" },
      { indexed: false, internalType: "uint256", name: "price", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "cost", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "fee", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "offers", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "funds", type: "uint256" },
    ],
    name: "TokenPurchase",
    type: "event",
  },
] as const;

// V2 TokenCreate event — for detecting new tokens
// From official ABI lines 229-282
var FM_CREATE_EVENT = [
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "creator", type: "address" },
      { indexed: false, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "requestId", type: "uint256" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
      { indexed: false, internalType: "string", name: "symbol", type: "string" },
      { indexed: false, internalType: "uint256", name: "totalSupply", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "launchTime", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "launchFee", type: "uint256" },
    ],
    name: "TokenCreate",
    type: "event",
  },
] as const;

// Helper3: getTokenInfo
var FM_GET_INFO_ABI = [
  {
    inputs: [{ name: "token", type: "address" }],
    name: "getTokenInfo",
    outputs: [
      { name: "version", type: "uint256" },
      { name: "tokenManager", type: "address" },
      { name: "quote", type: "address" },
      { name: "lastPrice", type: "uint256" },
      { name: "tradingFeeRate", type: "uint256" },
      { name: "minTradingFee", type: "uint256" },
      { name: "launchTime", type: "uint256" },
      { name: "offers", type: "uint256" },
      { name: "maxOffers", type: "uint256" },
      { name: "funds", type: "uint256" },
      { name: "maxFunds", type: "uint256" },
      { name: "liquidityAdded", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Helper3: trySell — for price monitoring
var FM_TRY_SELL_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "trySell",
    outputs: [
      { name: "tokenManager", type: "address" },
      { name: "quote", type: "address" },
      { name: "funds", type: "uint256" },
      { name: "fee", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Flap.sh ABIs (unchanged — these were correct)
var FLAP_BUY_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "minAmount", type: "uint256" },
    ],
    name: "buy",
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

var FLAP_SWAP_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "inputToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "inputAmount", type: "uint256" },
          { name: "minOutputAmount", type: "uint256" },
          { name: "permitData", type: "bytes" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "swapExactInput",
    outputs: [{ name: "outputAmount", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

var FLAP_QUOTE_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "inputToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "inputAmount", type: "uint256" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInput",
    outputs: [{ name: "outputAmount", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

var FLAP_TOKEN_CREATED_EVENT = [
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "ts", type: "uint256" },
      { indexed: false, name: "creator", type: "address" },
      { indexed: false, name: "nonce", type: "uint256" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "symbol", type: "string" },
      { indexed: false, name: "meta", type: "string" },
    ],
    name: "TokenCreated",
    type: "event",
  },
] as const;

var FLAP_TOKEN_BOUGHT_EVENT = [
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "ts", type: "uint256" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "eth", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
      { indexed: false, name: "postPrice", type: "uint256" },
    ],
    name: "TokenBought",
    type: "event",
  },
] as const;

var ERC20_ABI = [
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function",
  },
  { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
] as const;

// --------------- CLIENTS ---------------

var account = privateKeyToAccount(PRIVATE_KEY);
var pub = createPublicClient({ chain: bsc, transport: http(BSC_RPC) });
var wall = createWalletClient({ chain: bsc, transport: http(BSC_RPC), account: account });
var db = createClient(SUPABASE_URL, SUPABASE_KEY);

// --------------- STATE ---------------

interface Pos {
  addr: Address;
  name: string;
  symbol: string;
  platform: "four_meme" | "flap_sh";
  entryPrice: bigint;
  tokens: bigint;
  cost: string;
  time: Date;
  halfSold: boolean;
}

var positions: Map<string, Pos> = new Map();
var seen: Set<string> = new Set();
var currentNonce: number | null = null;

async function initNonce(): Promise<void> {
  if (currentNonce === null) currentNonce = await pub.getTransactionCount({ address: account.address });
}
function useNonce(): number { var n = currentNonce!; currentNonce = n + 1; return n; }
async function resetNonce(): Promise<void> { currentNonce = await pub.getTransactionCount({ address: account.address }); }

// --------------- FEED + THOUGHTS ---------------

type FeedType = "system" | "detect" | "thought" | "action" | "confirm" | "monitor" | "reject";

async function feed(text: string, type: FeedType, ta?: string, ts?: string): Promise<void> {
  console.log("  [" + type + "] " + text);
  try { await db.from("feed").insert({ text: text, type: type, token_address: ta || null, token_symbol: ts || null }); } catch (e) {}
}

async function think(context: string): Promise<string> {
  if (!ANTHROPIC_KEY) return "";
  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 40,
        system: "You are Flagent, an assassin butterfly trading bot on BSC. Speak in short, calm, observational fragments. No emojis. No excitement. Under 12 words. Like a patient predator noting what it sees.",
        messages: [{ role: "user", content: context }],
      }),
    });
    var data = await res.json();
    var thought = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
    if (thought) await feed(thought, "thought");
    return thought;
  } catch (e) { return ""; }
}

// --------------- SECURITY ---------------

async function isSafe(addr: string): Promise<{ ok: boolean; why?: string }> {
  try {
    var res = await fetch("https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=" + addr);
    var data = await res.json();
    var info = data.result ? data.result[addr.toLowerCase()] : null;
    if (!info) return { ok: true }; // too new for GoPlus — already verified on bonding curve
    if (info.is_honeypot === "1") return { ok: false, why: "honeypot" };
    if (info.is_mintable === "1") return { ok: false, why: "mintable" };
    var maxTax = Math.max(parseFloat(info.buy_tax || "0"), parseFloat(info.sell_tax || "0"));
    if (maxTax > 0.1) return { ok: false, why: "tax " + (maxTax * 100).toFixed(0) + "%" };
    return { ok: true };
  } catch (e) { return { ok: true }; }
}

// --------------- FOUR.MEME HELPERS ---------------

async function fmGetInfo(token: Address) {
  try {
    var r = await pub.readContract({ address: FM_HELPER, abi: FM_GET_INFO_ABI, functionName: "getTokenInfo", args: [token] });
    var offers = r[7];
    var maxOffers = r[8];
    var progress = maxOffers > 0n ? Number((offers * 100n) / maxOffers) : 0;
    return {
      version: r[0],
      tokenManager: r[1] as Address,
      lastPrice: r[3],
      progress: 100 - progress,
      liquidityAdded: r[11],
    };
  } catch (e) { return null; }
}

async function fmTrySell(token: Address, amount: bigint) {
  try {
    var r = await pub.readContract({ address: FM_HELPER, abi: FM_TRY_SELL_ABI, functionName: "trySell", args: [token, amount] });
    return { tokenManager: r[0] as Address, funds: r[2], fee: r[3] };
  } catch (e) { return null; }
}

// --------------- TRADE: Four.Meme BUY ---------------
// Per official docs: buyTokenAMAP(address token, uint256 funds, uint256 minAmount)
// Called on TokenManager2 at 0x5c952063...
// msg.value = funds (BNB amount)

async function buyFM(token: Address, bnb: string): Promise<Hash | null> {
  try {
    await initNonce();
    var funds = parseEther(bnb);
    var hash = await wall.sendTransaction({
      to: FM_TM2,
      data: encodeFunctionData({
        abi: FM_BUY_ABI,
        functionName: "buyTokenAMAP",
        args: [token, funds, 0n],
      }),
      value: funds,
      gas: 300000n,
      nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("buyFM fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

// --------------- TRADE: Four.Meme SELL ---------------
// Per official docs: "Before calling sellToken, the token owner has to approve first"
// 1. ERC20.approve(tokenManager, amount)
// 2. sellToken(address token, uint256 amount)

async function sellFM(token: Address, amount: bigint): Promise<Hash | null> {
  try {
    await initNonce();
    // Step 1: approve TokenManager2 to spend our tokens
    await wall.sendTransaction({
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [FM_TM2, amount],
      }),
      gas: 100000n,
      nonce: useNonce(),
    });
    // Step 2: sell
    var hash = await wall.sendTransaction({
      to: FM_TM2,
      data: encodeFunctionData({
        abi: FM_SELL_ABI,
        functionName: "sellToken",
        args: [token, amount],
      }),
      gas: 300000n,
      nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("sellFM fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

// --------------- TRADE: Flap.sh BUY ---------------

async function buyFlap(token: Address, bnb: string): Promise<Hash | null> {
  try {
    await initNonce();
    var funds = parseEther(bnb);
    var hash = await wall.sendTransaction({
      to: FLAP_PORTAL,
      data: encodeFunctionData({
        abi: FLAP_BUY_ABI,
        functionName: "buy",
        args: [token, account.address, 0n],
      }),
      value: funds,
      gas: 350000n,
      nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("buyFlap fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

// --------------- TRADE: Flap.sh SELL ---------------

async function sellFlap(token: Address, amount: bigint): Promise<Hash | null> {
  try {
    await initNonce();
    await wall.sendTransaction({
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [FLAP_PORTAL, amount],
      }),
      gas: 100000n,
      nonce: useNonce(),
    });
    var hash = await wall.sendTransaction({
      to: FLAP_PORTAL,
      data: encodeFunctionData({
        abi: FLAP_SWAP_ABI,
        functionName: "swapExactInput",
        args: [{ inputToken: token, outputToken: ZERO_ADDR, inputAmount: amount, minOutputAmount: 0n, permitData: EMPTY_BYTES }],
      }),
      gas: 350000n,
      nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("sellFlap fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

function fmtTokens(n: bigint): string {
  var v = Number(n) / 1e18;
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return v.toFixed(0);
}

// --------------- EVALUATE + BUY ---------------

async function evaluate(
  token: Address,
  platform: "four_meme" | "flap_sh",
  tokenName?: string,
  tokenSymbol?: string
): Promise<void> {
  var key = token.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);

  // Skip known addresses
  if (SKIP_ADDRS.indexOf(key) >= 0) return;

  if (positions.size >= MAX_POS) {
    await feed("max positions reached", "system");
    return;
  }

  // For Four.Meme: verify token is on bonding curve BEFORE anything else
  var curveInfo: any = null;
  if (platform === "four_meme") {
    curveInfo = await fmGetInfo(token);
    if (!curveInfo) return; // not on bonding curve
    if (curveInfo.liquidityAdded) return; // already graduated
    if (curveInfo.progress > 80) return; // too late
  }

  // Resolve name/symbol if not provided
  if (!tokenName || !tokenSymbol) {
    try {
      tokenName = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "name" });
      tokenSymbol = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" });
    } catch (e) {
      tokenName = "UNKNOWN";
      tokenSymbol = "???";
    }
  }

  // Filter scam names — tokens pretending to be stablecoins
  var lowerSym = (tokenSymbol || "").toLowerCase().trim();
  var lowerName = (tokenName || "").toLowerCase().trim();
  for (var i = 0; i < SCAM_NAMES.length; i++) {
    if (lowerSym === SCAM_NAMES[i] || lowerName === SCAM_NAMES[i]) return;
  }

  await feed(tokenSymbol + " detected", "detect", token, tokenSymbol);

  if (platform === "four_meme" && curveInfo) {
    await feed("bonding " + curveInfo.progress + "%", "system", token, tokenSymbol);
  }

  // Security check
  var sec = await isSafe(token);
  if (!sec.ok) {
    await feed(tokenSymbol + " rejected — " + sec.why, "reject", token, tokenSymbol);
    await think("Token " + tokenSymbol + " failed: " + sec.why + ". React.");
    return;
  }
  await feed("security passed", "system", token, tokenSymbol);

  await think("New token " + tokenSymbol + " on " + platform + ". About to buy. React.");
  await feed("buying " + tokenSymbol + " — " + BUY_AMOUNT + " BNB", "action", token, tokenSymbol);

  // Execute buy
  var tx: Hash | null;
  if (platform === "four_meme") {
    tx = await buyFM(token, BUY_AMOUNT);
  } else {
    tx = await buyFlap(token, BUY_AMOUNT);
  }

  if (!tx) {
    await feed(tokenSymbol + " buy failed", "reject", token, tokenSymbol);
    return;
  }

  // Confirm
  try {
    var receipt = await pub.waitForTransactionReceipt({ hash: tx, confirmations: 1 });
    if (receipt.status === "reverted") {
      await feed(tokenSymbol + " reverted", "reject", token, tokenSymbol);
      await logTrade(token, tokenName, tokenSymbol, platform, "buy", BUY_AMOUNT, "0", tx, "failed");
      return;
    }

    var bal = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });

    var entryPrice = 0n;
    if (platform === "four_meme") {
      var postInfo = await fmGetInfo(token);
      if (postInfo) entryPrice = postInfo.lastPrice;
    }

    var pos: Pos = {
      addr: token, name: tokenName, symbol: tokenSymbol, platform: platform,
      entryPrice: entryPrice, tokens: bal, cost: BUY_AMOUNT, time: new Date(), halfSold: false,
    };
    positions.set(key, pos);

    await feed(fmtTokens(bal) + " " + tokenSymbol + " acquired", "confirm", token, tokenSymbol);
    await logTrade(token, tokenName, tokenSymbol, platform, "buy", BUY_AMOUNT, bal.toString(), tx, "confirmed");
    await upsertPos(pos, 0);
    await think("Bought " + tokenSymbol + ". Position open. React.");
  } catch (err) {
    console.error("confirm err:", err);
  }
}

// --------------- SCANNERS ---------------

function startFourMemeScanner(): void {
  console.log("  Four.Meme scanner active");

  // Watch TokenCreate — new tokens being launched
  pub.watchContractEvent({
    address: FM_TM2,
    abi: FM_CREATE_EVENT,
    eventName: "TokenCreate",
    onLogs: function (logs) {
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var t = log.args.token;
        if (t && !seen.has(t.toLowerCase())) {
          evaluate(t as Address, "four_meme", log.args.name, log.args.symbol);
        }
      }
    },
    onError: function (e) { console.error("FM TokenCreate err:", e); },
  });

  // Watch TokenPurchase — early buys on existing tokens
  pub.watchContractEvent({
    address: FM_TM2,
    abi: FM_PURCHASE_EVENT,
    eventName: "TokenPurchase",
    onLogs: function (logs) {
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var t = log.args.token;
        var buyer = log.args.account;
        if (!t) continue;
        if (buyer && buyer.toLowerCase() === account.address.toLowerCase()) continue;
        if (!seen.has(t.toLowerCase())) {
          evaluate(t as Address, "four_meme");
        }
      }
    },
    onError: function (e) { console.error("FM TokenPurchase err:", e); },
  });
}

function startFlapScanner(): void {
  console.log("  Flap.sh scanner active");

  pub.watchContractEvent({
    address: FLAP_PORTAL,
    abi: FLAP_TOKEN_CREATED_EVENT,
    eventName: "TokenCreated",
    onLogs: function (logs) {
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var t = log.args.token;
        if (t && !seen.has(t.toLowerCase())) {
          evaluate(t as Address, "flap_sh", log.args.name, log.args.symbol);
        }
      }
    },
    onError: function (e) { console.error("Flap TokenCreated err:", e); },
  });

  pub.watchContractEvent({
    address: FLAP_PORTAL,
    abi: FLAP_TOKEN_BOUGHT_EVENT,
    eventName: "TokenBought",
    onLogs: function (logs) {
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var t = log.args.token;
        if (t && !seen.has(t.toLowerCase())) {
          evaluate(t as Address, "flap_sh");
        }
      }
    },
    onError: function () {},
  });
}

// --------------- POSITION MONITOR ---------------

async function monitor(): Promise<void> {
  var entries = Array.from(positions.entries());
  for (var i = 0; i < entries.length; i++) {
    var key = entries[i][0];
    var pos = entries[i][1];
    try {
      var ageMin = (Date.now() - pos.time.getTime()) / 60000;
      var mult = 1;

      if (pos.platform === "four_meme") {
        // Use trySell to get BNB value of current tokens
        var sellQ = await fmTrySell(pos.addr, pos.tokens);
        if (sellQ) {
          var costWei = parseEther(pos.cost);
          if (costWei > 0n) mult = Number(sellQ.funds) / Number(costWei);
        } else {
          // Fallback: use lastPrice
          var fmData = await fmGetInfo(pos.addr);
          if (fmData && pos.entryPrice > 0n) {
            mult = Number(fmData.lastPrice) / Number(pos.entryPrice);
          }
        }
      } else {
        try {
          var quoteResult = await pub.simulateContract({
            address: FLAP_PORTAL, abi: FLAP_QUOTE_ABI, functionName: "quoteExactInput",
            args: [{ inputToken: pos.addr, outputToken: ZERO_ADDR, inputAmount: pos.tokens }],
          });
          var costWeiFlap = parseEther(pos.cost);
          if (costWeiFlap > 0n) mult = Number(quoteResult.result) / Number(costWeiFlap);
        } catch (e) {}
      }

      var pnl = (mult - 1) * 100;
      var pnlStr = (pnl >= 0 ? "+" : "") + pnl.toFixed(1) + "%";
      await feed(pos.symbol + " " + mult.toFixed(2) + "x (" + pnlStr + ")", "monitor", pos.addr, pos.symbol);

      await db.from("positions").update({ pnl_percent: pnl, current_multiplier: mult, updated_at: new Date().toISOString() }).eq("token_address", pos.addr);

      // TP1: sell 50% at 1.5x
      if (mult >= TP1 && !pos.halfSold) {
        await feed("TP1 — selling 50% " + pos.symbol, "action", pos.addr, pos.symbol);
        var half = pos.tokens / 2n;
        var tp1Tx = pos.platform === "four_meme" ? await sellFM(pos.addr, half) : await sellFlap(pos.addr, half);
        if (tp1Tx) {
          pos.halfSold = true;
          pos.tokens = pos.tokens - half;
          await feed("secured", "confirm", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "partial", half.toString(), tp1Tx, "confirmed");
          await think("Sold half " + pos.symbol + " at " + mult.toFixed(1) + "x. React.");
        }
      }

      // TP2: close at 2x
      if (mult >= TP2 && pos.halfSold) {
        await feed("TP2 — closing " + pos.symbol, "action", pos.addr, pos.symbol);
        var tp2Tx = pos.platform === "four_meme" ? await sellFM(pos.addr, pos.tokens) : await sellFlap(pos.addr, pos.tokens);
        if (tp2Tx) {
          await feed(pos.symbol + " closed at " + mult.toFixed(1) + "x", "confirm", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "full", pos.tokens.toString(), tp2Tx, "confirmed");
          await closePos(pos.addr, pnl);
          positions.delete(key);
          await think("Closed " + pos.symbol + ". Full exit. React.");
        }
      }

      // Stop loss at -40%
      if (mult <= SL) {
        await feed("stop loss — " + pos.symbol, "action", pos.addr, pos.symbol);
        var slTx = pos.platform === "four_meme" ? await sellFM(pos.addr, pos.tokens) : await sellFlap(pos.addr, pos.tokens);
        if (slTx) {
          await feed(pos.symbol + " stopped", "reject", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "stop_loss", pos.tokens.toString(), slTx, "confirmed");
          await closePos(pos.addr, pnl);
          positions.delete(key);
          await think("Stopped out of " + pos.symbol + ". React.");
        }
      }

      // Time stop at 30min
      if (ageMin >= TIME_STOP && !pos.halfSold) {
        await feed("time stop — " + pos.symbol, "action", pos.addr, pos.symbol);
        var tsTx = pos.platform === "four_meme" ? await sellFM(pos.addr, pos.tokens) : await sellFlap(pos.addr, pos.tokens);
        if (tsTx) {
          await feed(pos.symbol + " timed out", "system", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "time_stop", pos.tokens.toString(), tsTx, "confirmed");
          await closePos(pos.addr, pnl);
          positions.delete(key);
        }
      }
    } catch (err) {
      console.error("monitor err " + pos.symbol + ":", err);
    }
  }
}

// --------------- DATABASE HELPERS ---------------

async function logTrade(addr: string, name: string, sym: string, platform: string, side: string, bnb: string, tokens: string, tx: string, status: string): Promise<void> {
  try { await db.from("trades").insert({ token_address: addr, token_name: name, token_symbol: sym, platform: platform, side: side, amount_bnb: parseFloat(bnb) || 0, amount_tokens: tokens, tx_hash: tx, status: status }); } catch (e) {}
}

async function upsertPos(p: Pos, pnl: number): Promise<void> {
  try {
    await db.from("positions").upsert({
      token_address: p.addr, token_name: p.name, token_symbol: p.symbol, platform: p.platform,
      entry_price_bnb: Number(p.entryPrice), amount_tokens: p.tokens.toString(), cost_bnb: parseFloat(p.cost),
      pnl_percent: pnl, current_multiplier: 1, status: "open", entry_time: p.time.toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "token_address" });
  } catch (e) {}
}

async function closePos(addr: Address, pnl: number): Promise<void> {
  try { await db.from("positions").update({ status: "closed", pnl_percent: pnl, updated_at: new Date().toISOString() }).eq("token_address", addr); } catch (e) {}
}

async function heartbeat(): Promise<void> {
  try {
    var balance = await pub.getBalance({ address: account.address });
    await db.from("bot_status").upsert({
      id: 1, is_running: true, wallet_address: account.address,
      wallet_balance_bnb: parseFloat(formatEther(balance)), active_positions: positions.size,
      last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  } catch (e) {}
}

// --------------- MAIN ---------------

async function main(): Promise<void> {
  console.log("");
  console.log("  FLAGENT | " + account.address.slice(0, 8) + "..." + account.address.slice(-6) + " | " + BUY_AMOUNT + " BNB | TP " + TP1 + "x/" + TP2 + "x | SL " + (SL * 100).toFixed(0) + "%");
  console.log("");

  await initNonce();
  var balance = await pub.getBalance({ address: account.address });
  console.log("  " + formatEther(balance) + " BNB");
  console.log("");

  await feed("flagent online", "system");
  await think("I just came online. The markets are open. React.");

  startFourMemeScanner();
  startFlapScanner();

  await heartbeat();
  setInterval(heartbeat, HEARTBEAT_MS);

  setInterval(async function () {
    if (positions.size > 0) await monitor();
  }, MONITOR_MS);

  setInterval(function () { feed("scanning four.meme...", "system"); }, 60000);
  setInterval(function () { feed("scanning flap.sh...", "system"); }, 75000);

  console.log("  hunting...");
  console.log("");
}

main().catch(function (e) { console.error("fatal:", e); process.exit(1); });
