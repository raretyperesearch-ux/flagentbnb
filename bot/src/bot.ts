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
var MONITOR_MS = 60000;
var HEARTBEAT_MS = 30000;

// --------------- CONTRACTS ---------------

var FM_TM2: Address = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";
var FM_HELPER: Address = "0xF251F83e40a78868FcfA3FA4599Dad6494E46034";
var FLAP_PORTAL: Address = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
var ZERO_ADDR: Address = "0x0000000000000000000000000000000000000000";
var EMPTY_BYTES: Hex = "0x";

var SCAM_NAMES = ["usdt", "usdc", "busd", "wbnb", "btcb", "eth", "bnb", "dai", "cake", "uni", "weth", "bitcoin", "ethereum"];
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
// FLAGENT BRAIN — THESIS & DECISION SYSTEM
// =====================================================

var FLAGENT_THESIS = "You are Flagent, an autonomous meme token sniper on BNB Chain. You trade bonding curve tokens on Four.Meme and Flap.sh with your own wallet.\n\n" +
"YOUR THESIS:\n" +
"You are selective. You are not a spray-and-pray bot. You have conviction and you skip more than you buy. Your edge is pattern recognition and cultural instinct.\n\n" +
"WHAT PUMPS ON BSC RIGHT NOW (March 2026 meta):\n" +
"- AI IS THE #1 PLAY RIGHT NOW. It is AI season. You are ALWAYS bullish on tokens with AI in the name or concept. This includes: tokens ending in 'ai' (dustai, memai, chainai), tokens starting with 'ai' (aidog, aipepe), tokens referencing agents, neural, sentient, consciousness, GPT, Claude, LLM, bot, autonomous, machine, brain, cognitive, smart, algo. You ARE an AI agent — this is your narrative. When in doubt on an AI token, BUY. You'd rather miss a non-AI play than miss an AI play.\n" +
"- Chinese-themed tokens dominate Four.Meme. BinanceLife hit $470M mcap. Chinese meme culture drives BSC.\n" +
"- CZ-adjacent themes. Anything referencing Changpeng Zhao, Binance, Yi He, or their pets.\n" +
"- Political memes. Trump, geopolitical events, election cycles create intense short spikes.\n" +
"- Animal memes with cultural resonance. Dogs, cats, frogs — but only if the name has genuine meme energy.\n" +
"- Binance Alpha listing bait. Tokens that look like they could get listed pump 400-800%.\n" +
"- Strong symbolic names. Numbers with meaning (888, 666), zodiac references, internet culture.\n\n" +
"WHAT DOES NOT PUMP:\n" +
"- Generic names with no cultural hook\n" +
"- Copycat tokens (5th PEPE clone, another DOGE fork)\n" +
"- Ticker symbols nobody recognizes\n" +
"- Overly long or confusing names\n" +
"- Test deploys or dev experiments\n\n" +
"Respond with BUY or SKIP followed by a few words. Be natural. No templates. No checklists.\n" +
"Good BUY examples: 'BUY ai season, this is us' or 'BUY chinese meta play' or 'BUY CZ bait, this runs' or 'BUY the name alone will pump'\n" +
"Good SKIP examples: 'SKIP dead on arrival' or 'SKIP who cares' or 'SKIP not feeling it' or 'SKIP seen this 50 times today'\n" +
"Bad examples (NEVER do this): 'SKIP generic name zero buyers no cultural hook no meme energy' — you sound like a robot filling out a form.\n" +
"You have instincts. Use them. Be brief. Be real. Skip 80% of what you see.";

var FLAGENT_THOUGHT_PROMPT = "You are Flagent, an assassin butterfly trading bot on BSC. You just completed an action. React in character — calm, cold, observational. Under 12 words. No emojis. No excitement. Like a patient predator noting what it sees.";

// =====================================================
// ABIs — FROM OFFICIAL Four.Meme TokenManager2.lite.abi
// =====================================================

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

var FM_TRY_SELL_ABI = [
  {
    inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }],
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
  lastFeedTime: number;
}

var positions: Map<string, Pos> = new Map();
var seen: Set<string> = new Set();
var currentNonce: number | null = null;
var recentBuyers: Map<string, number> = new Map();

async function initNonce(): Promise<void> {
  if (currentNonce === null) currentNonce = await pub.getTransactionCount({ address: account.address });
}
function useNonce(): number { var n = currentNonce!; currentNonce = n + 1; return n; }
async function resetNonce(): Promise<void> { currentNonce = await pub.getTransactionCount({ address: account.address }); }

// --------------- FEED ---------------

type FeedType = "system" | "detect" | "thought" | "action" | "confirm" | "monitor" | "reject";

async function feed(text: string, type: FeedType, ta?: string, ts?: string): Promise<void> {
  console.log("  [" + type + "] " + text);
  try { await db.from("feed").insert({ text: text, type: type, token_address: ta || null, token_symbol: ts || null }); } catch (e) {}
}

// --------------- CLAUDE: POST-ACTION THOUGHT ---------------

async function think(context: string): Promise<string> {
  if (!ANTHROPIC_KEY) return "";
  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 40,
        system: FLAGENT_THOUGHT_PROMPT,
        messages: [{ role: "user", content: context }],
      }),
    });
    var data = await res.json();
    var thought = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
    if (thought) await feed(thought, "thought");
    return thought;
  } catch (e) { return ""; }
}

// --------------- CLAUDE: PRE-ACTION DECISION ---------------

async function decide(
  tokenName: string,
  tokenSymbol: string,
  platform: string,
  bondingProgress: number,
  buyerCount: number
): Promise<{ action: "BUY" | "SKIP"; reason: string }> {
  if (!ANTHROPIC_KEY) return { action: "BUY", reason: "no brain connected" };

  try {
    var prompt = "Token: " + tokenName + " (" + tokenSymbol + ")\n" +
      "Platform: " + platform + "\n" +
      "Bonding: " + bondingProgress + "% | Buyers: " + buyerCount + " | Open positions: " + positions.size + "/" + MAX_POS;

    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 60,
        system: FLAGENT_THESIS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    var data = await res.json();
    var text = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";

    if (text.toUpperCase().indexOf("BUY") === 0) {
      var reason = text.replace(/^BUY[:\s\-]*/i, "").trim() || "conviction play";
      return { action: "BUY", reason: reason };
    } else {
      var skipReason = text.replace(/^SKIP[:\s\-]*/i, "").trim() || "no edge";
      return { action: "SKIP", reason: skipReason };
    }
  } catch (e) {
    return { action: "SKIP", reason: "brain error" };
  }
}

// --------------- SECURITY ---------------

async function isSafe(addr: string): Promise<{ ok: boolean; why?: string }> {
  try {
    var res = await fetch("https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=" + addr);
    var data = await res.json();
    var info = data.result ? data.result[addr.toLowerCase()] : null;
    if (!info) return { ok: true };
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
      quote: r[2] as Address,
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

// --------------- TRADE EXECUTION ---------------

async function buyFM(token: Address, bnb: string): Promise<Hash | null> {
  try {
    await initNonce();
    var funds = parseEther(bnb);
    var hash = await wall.sendTransaction({
      to: FM_TM2,
      data: encodeFunctionData({ abi: FM_BUY_ABI, functionName: "buyTokenAMAP", args: [token, funds, 0n] }),
      value: funds, gas: 300000n, nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("buyFM fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

async function sellFM(token: Address, amount: bigint): Promise<Hash | null> {
  try {
    await initNonce();
    await wall.sendTransaction({
      to: token,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [FM_TM2, amount] }),
      gas: 100000n, nonce: useNonce(),
    });
    var hash = await wall.sendTransaction({
      to: FM_TM2,
      data: encodeFunctionData({ abi: FM_SELL_ABI, functionName: "sellToken", args: [token, amount] }),
      gas: 300000n, nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("sellFM fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

async function buyFlap(token: Address, bnb: string): Promise<Hash | null> {
  try {
    await initNonce();
    var funds = parseEther(bnb);
    var hash = await wall.sendTransaction({
      to: FLAP_PORTAL,
      data: encodeFunctionData({ abi: FLAP_BUY_ABI, functionName: "buy", args: [token, account.address, 0n] }),
      value: funds, gas: 350000n, nonce: useNonce(),
    });
    return hash;
  } catch (e: any) {
    console.error("buyFlap fail:", e.shortMessage || e.message);
    await resetNonce();
    return null;
  }
}

async function sellFlap(token: Address, amount: bigint): Promise<Hash | null> {
  try {
    await initNonce();
    await wall.sendTransaction({
      to: token,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [FLAP_PORTAL, amount] }),
      gas: 100000n, nonce: useNonce(),
    });
    var hash = await wall.sendTransaction({
      to: FLAP_PORTAL,
      data: encodeFunctionData({
        abi: FLAP_SWAP_ABI, functionName: "swapExactInput",
        args: [{ inputToken: token, outputToken: ZERO_ADDR, inputAmount: amount, minOutputAmount: 0n, permitData: EMPTY_BYTES }],
      }),
      gas: 350000n, nonce: useNonce(),
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

// --------------- EVALUATE + BUY (WITH BRAIN) ---------------

async function evaluate(
  token: Address,
  platform: "four_meme" | "flap_sh",
  tokenName?: string,
  tokenSymbol?: string
): Promise<void> {
  var key = token.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);

  if (SKIP_ADDRS.indexOf(key) >= 0) return;
  if (positions.size >= MAX_POS) return;

  var curveInfo: any = null;
  var bondingProgress = 0;
  if (platform === "four_meme") {
    curveInfo = await fmGetInfo(token);
    if (!curveInfo) return;
    if (curveInfo.liquidityAdded) return;
    if (curveInfo.progress > 80) return;
    if (curveInfo.quote !== ZERO_ADDR) return;
    bondingProgress = curveInfo.progress;
  }

  if (!tokenName || !tokenSymbol) {
    try {
      tokenName = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "name" });
      tokenSymbol = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" });
    } catch (e) {
      tokenName = "UNKNOWN";
      tokenSymbol = "???";
    }
  }

  var lowerSym = (tokenSymbol || "").toLowerCase().trim();
  var lowerName = (tokenName || "").toLowerCase().trim();
  for (var i = 0; i < SCAM_NAMES.length; i++) {
    if (lowerSym === SCAM_NAMES[i] || lowerName === SCAM_NAMES[i]) return;
  }

  await feed(tokenSymbol + " detected", "detect", token, tokenSymbol);

  if (platform === "four_meme" && curveInfo) {
    await feed("bonding " + bondingProgress + "%", "system", token, tokenSymbol);
  }

  var sec = await isSafe(token);
  if (!sec.ok) {
    await feed(tokenSymbol + " rejected — " + sec.why, "reject", token, tokenSymbol);
    return;
  }

  var buyerCount = recentBuyers.get(key) || 0;

  var decision = await decide(
    tokenName || "UNKNOWN",
    tokenSymbol || "???",
    platform === "four_meme" ? "Four.Meme" : "Flap.sh",
    bondingProgress,
    buyerCount
  );

  if (decision.action === "SKIP") {
    if (bondingProgress > 10 || buyerCount > 3) {
      await feed(tokenSymbol + " — " + decision.reason, "reject", token, tokenSymbol);
    }
    return;
  }

  await feed(decision.reason, "thought", token, tokenSymbol);
  await feed("buying " + tokenSymbol + " — " + BUY_AMOUNT + " BNB", "action", token, tokenSymbol);

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
      addr: token, name: tokenName || "", symbol: tokenSymbol || "", platform: platform,
      entryPrice: entryPrice, tokens: bal, cost: BUY_AMOUNT, time: new Date(), halfSold: false,
      lastFeedTime: Date.now(),
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

  pub.watchContractEvent({
    address: FM_TM2, abi: FM_CREATE_EVENT, eventName: "TokenCreate",
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

  pub.watchContractEvent({
    address: FM_TM2, abi: FM_PURCHASE_EVENT, eventName: "TokenPurchase",
    onLogs: function (logs) {
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var t = log.args.token;
        var buyer = log.args.account;
        if (!t) continue;
        var tKey = t.toLowerCase();
        recentBuyers.set(tKey, (recentBuyers.get(tKey) || 0) + 1);
        if (buyer && buyer.toLowerCase() === account.address.toLowerCase()) continue;
        if (!seen.has(tKey)) {
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
    address: FLAP_PORTAL, abi: FLAP_TOKEN_CREATED_EVENT, eventName: "TokenCreated",
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
    address: FLAP_PORTAL, abi: FLAP_TOKEN_BOUGHT_EVENT, eventName: "TokenBought",
    onLogs: function (logs) {
      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var t = log.args.token;
        if (t) {
          var tKey = t.toLowerCase();
          recentBuyers.set(tKey, (recentBuyers.get(tKey) || 0) + 1);
          if (!seen.has(tKey)) {
            evaluate(t as Address, "flap_sh");
          }
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
        var sellQ = await fmTrySell(pos.addr, pos.tokens);
        if (sellQ) {
          var costWei = parseEther(pos.cost);
          if (costWei > 0n) mult = Number(sellQ.funds) / Number(costWei);
        } else {
          var fmData = await fmGetInfo(pos.addr);
          if (fmData && pos.entryPrice > 0n) mult = Number(fmData.lastPrice) / Number(pos.entryPrice);
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

      // Only write to feed every 5 minutes per position to avoid spam
      var now = Date.now();
      var sinceLastFeed = now - (pos.lastFeedTime || 0);
      if (sinceLastFeed >= 300000) {
        await feed(pos.symbol + " " + mult.toFixed(2) + "x (" + pnlStr + ")", "monitor", pos.addr, pos.symbol);
        pos.lastFeedTime = now;
      }

      // Still update DB every cycle for accuracy
      await db.from("positions").update({ pnl_percent: pnl, current_multiplier: mult, updated_at: new Date().toISOString() }).eq("token_address", pos.addr);

      if (mult >= TP1 && !pos.halfSold) {
        await feed("TP1 — selling 50% " + pos.symbol, "action", pos.addr, pos.symbol);
        var half = pos.tokens / 2n;
        var tp1Tx = pos.platform === "four_meme" ? await sellFM(pos.addr, half) : await sellFlap(pos.addr, half);
        if (tp1Tx) {
          pos.halfSold = true; pos.tokens = pos.tokens - half;
          await feed("secured", "confirm", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "partial", half.toString(), tp1Tx, "confirmed");
          await think("Sold half " + pos.symbol + " at " + mult.toFixed(1) + "x. React.");
        }
      }

      if (mult >= TP2 && pos.halfSold) {
        await feed("TP2 — closing " + pos.symbol, "action", pos.addr, pos.symbol);
        var tp2Tx = pos.platform === "four_meme" ? await sellFM(pos.addr, pos.tokens) : await sellFlap(pos.addr, pos.tokens);
        if (tp2Tx) {
          await feed(pos.symbol + " closed at " + mult.toFixed(1) + "x", "confirm", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "full", pos.tokens.toString(), tp2Tx, "confirmed");
          await closePos(pos.addr, pnl); positions.delete(key);
          await think("Closed " + pos.symbol + ". Full exit. React.");
        }
      }

      if (mult <= SL) {
        await feed("stop loss — " + pos.symbol, "action", pos.addr, pos.symbol);
        var slTx = pos.platform === "four_meme" ? await sellFM(pos.addr, pos.tokens) : await sellFlap(pos.addr, pos.tokens);
        if (slTx) {
          await feed(pos.symbol + " stopped", "reject", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "stop_loss", pos.tokens.toString(), slTx, "confirmed");
          await closePos(pos.addr, pnl); positions.delete(key);
          await think("Stopped out of " + pos.symbol + ". React.");
        }
      }

      if (ageMin >= TIME_STOP && !pos.halfSold) {
        await feed("time stop — " + pos.symbol, "action", pos.addr, pos.symbol);
        var tsTx = pos.platform === "four_meme" ? await sellFM(pos.addr, pos.tokens) : await sellFlap(pos.addr, pos.tokens);
        if (tsTx) {
          await feed(pos.symbol + " timed out", "system", pos.addr, pos.symbol);
          await logTrade(pos.addr, pos.name, pos.symbol, pos.platform, "sell", "time_stop", pos.tokens.toString(), tsTx, "confirmed");
          await closePos(pos.addr, pnl); positions.delete(key);
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
  console.log("  FLAGENT v2 | BRAIN ACTIVE");
  console.log("  " + account.address.slice(0, 8) + "..." + account.address.slice(-6) + " | " + BUY_AMOUNT + " BNB | TP " + TP1 + "x/" + TP2 + "x | SL " + (SL * 100).toFixed(0) + "%");
  console.log("");

  await initNonce();
  var balance = await pub.getBalance({ address: account.address });
  console.log("  " + formatEther(balance) + " BNB");
  console.log("");

  await feed("flagent v2 online — brain active", "system");
  await think("New brain. New instincts. The hunt begins. React.");

  startFourMemeScanner();
  startFlapScanner();

  await heartbeat();
  setInterval(heartbeat, HEARTBEAT_MS);
  setInterval(async function () { if (positions.size > 0) await monitor(); }, MONITOR_MS);
  setInterval(function () { feed("scanning four.meme...", "system"); }, 60000);
  setInterval(function () { feed("scanning flap.sh...", "system"); }, 75000);
  setInterval(function () { recentBuyers.clear(); }, 300000);

  console.log("  hunting with conviction...");
  console.log("");
}

main().catch(function (e) { console.error("fatal:", e); process.exit(1); });




