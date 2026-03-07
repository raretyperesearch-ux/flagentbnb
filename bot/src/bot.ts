// ============================================================
// FLAGENT — Production Bot v3.0
// Four.Meme + Flap.sh direct protocol integration
// Claude Sonnet 4 for agent thoughts
// Supabase: 4Gent project (shared)
// ============================================================

import {
  createPublicClient, createWalletClient, http, parseEther, formatEther,
  encodeFunctionData, type Address, type Hash,
} from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "@supabase/supabase-js";

const C = {
  PRIVATE_KEY: process.env.PRIVATE_KEY as \`0x\${string}\`,
  BSC_RPC: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
  SUPABASE_URL: "https://seartddspffufwiqzwvh.supabase.co",
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY!,
  ANTHROPIC_KEY: process.env.ANTHROPIC_API_KEY || "",
  BUY_AMOUNT: process.env.BUY_AMOUNT_BNB || "0.01",
  MAX_POS: parseInt(process.env.MAX_POSITIONS || "5"),
  TP1: parseFloat(process.env.TAKE_PROFIT_1 || "2.0"),
  TP2: parseFloat(process.env.TAKE_PROFIT_2 || "3.0"),
  SL: parseFloat(process.env.STOP_LOSS || "0.6"),
  TIME_STOP: parseInt(process.env.TIME_STOP_MINUTES || "30"),
  MONITOR_MS: 10_000,
  HEARTBEAT_MS: 30_000,
};

// Verified contract addresses
const FM_LAUNCHPAD: Address = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";
const FM_HELPER: Address = "0xF251F83e40a78868FcfA3FA4599Dad6494E46034";
const FLAP_PORTAL: Address = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const ZERO: Address = "0x0000000000000000000000000000000000000000";

// --- ABIs ---
const FM_BUY_ABI = [{inputs:[{name:"origin",type:"uint256"},{name:"token",type:"address"},{name:"funds",type:"uint256"},{name:"minAmount",type:"uint256"}],name:"buyTokenAMAP",outputs:[],stateMutability:"payable",type:"function"}] as const;
const FM_SELL_ABI = [{inputs:[{name:"token",type:"address"},{name:"amount",type:"uint256"}],name:"sellToken",outputs:[],stateMutability:"nonpayable",type:"function"}] as const;
const FM_GET_INFO_ABI = [{inputs:[{name:"token",type:"address"}],name:"getTokenInfo",outputs:[{name:"version",type:"uint256"},{name:"tokenManager",type:"address"},{name:"quote",type:"address"},{name:"lastPrice",type:"uint256"},{name:"tradingFeeRate",type:"uint256"},{name:"minTradingFee",type:"uint256"},{name:"launchTime",type:"uint256"},{name:"offers",type:"uint256"},{name:"maxOffers",type:"uint256"},{name:"funds",type:"uint256"},{name:"maxFunds",type:"uint256"},{name:"liquidityAdded",type:"bool"}],stateMutability:"view",type:"function"}] as const;
const FM_TRY_SELL_ABI = [{inputs:[{name:"token",type:"address"},{name:"amount",type:"uint256"}],name:"trySell",outputs:[{name:"tokenManager",type:"address"},{name:"quote",type:"address"},{name:"funds",type:"uint256"},{name:"fee",type:"uint256"}],stateMutability:"view",type:"function"}] as const;
const FM_PURCHASE_EVENT = [{anonymous:false,inputs:[{indexed:true,name:"token",type:"address"},{indexed:true,name:"sender",type:"address"},{indexed:false,name:"amount",type:"uint256"},{indexed:false,name:"cost",type:"uint256"},{indexed:false,name:"fee",type:"uint256"}],name:"TokenPurchase",type:"event"}] as const;
const FLAP_BUY_ABI = [{inputs:[{name:"token",type:"address"},{name:"recipient",type:"address"},{name:"minAmount",type:"uint256"}],name:"buy",outputs:[{name:"amount",type:"uint256"}],stateMutability:"payable",type:"function"}] as const;
const FLAP_SWAP_ABI = [{inputs:[{components:[{name:"inputToken",type:"address"},{name:"outputToken",type:"address"},{name:"inputAmount",type:"uint256"},{name:"minOutputAmount",type:"uint256"},{name:"permitData",type:"bytes"}],name:"params",type:"tuple"}],name:"swapExactInput",outputs:[{name:"outputAmount",type:"uint256"}],stateMutability:"payable",type:"function"}] as const;
const FLAP_QUOTE_ABI = [{inputs:[{components:[{name:"inputToken",type:"address"},{name:"outputToken",type:"address"},{name:"inputAmount",type:"uint256"}],name:"params",type:"tuple"}],name:"quoteExactInput",outputs:[{name:"outputAmount",type:"uint256"}],stateMutability:"nonpayable",type:"function"}] as const;
const FLAP_TOKEN_CREATED_EVENT = [{anonymous:false,inputs:[{indexed:false,name:"ts",type:"uint256"},{indexed:false,name:"creator",type:"address"},{indexed:false,name:"nonce",type:"uint256"},{indexed:false,name:"token",type:"address"},{indexed:false,name:"name",type:"string"},{indexed:false,name:"symbol",type:"string"},{indexed:false,name:"meta",type:"string"}],name:"TokenCreated",type:"event"}] as const;
const FLAP_TOKEN_BOUGHT_EVENT = [{anonymous:false,inputs:[{indexed:false,name:"ts",type:"uint256"},{indexed:false,name:"token",type:"address"},{indexed:false,name:"buyer",type:"address"},{indexed:false,name:"amount",type:"uint256"},{indexed:false,name:"eth",type:"uint256"},{indexed:false,name:"fee",type:"uint256"},{indexed:false,name:"postPrice",type:"uint256"}],name:"TokenBought",type:"event"}] as const;
const ERC20_ABI = [
  {inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],name:"approve",outputs:[{name:"",type:"bool"}],stateMutability:"nonpayable",type:"function"},
  {inputs:[{name:"account",type:"address"}],name:"balanceOf",outputs:[{name:"",type:"uint256"}],stateMutability:"view",type:"function"},
  {inputs:[],name:"symbol",outputs:[{name:"",type:"string"}],stateMutability:"view",type:"function"},
  {inputs:[],name:"name",outputs:[{name:"",type:"string"}],stateMutability:"view",type:"function"},
] as const;

// --- Clients ---
const account = privateKeyToAccount(C.PRIVATE_KEY);
const pub = createPublicClient({ chain: bsc, transport: http(C.BSC_RPC), batch:{multicall:{batchSize:200_000}} });
const wall = createWalletClient({ chain: bsc, transport: http(C.BSC_RPC), account });
const db = createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

// --- State ---
interface Pos { addr:Address; name:string; symbol:string; platform:"four_meme"|"flap_sh"; entryPrice:bigint; tokens:bigint; cost:string; time:Date; halfSold:boolean; }
const positions: Map<string,Pos> = new Map();
const seen: Set<string> = new Set();
let nonce: number|null = null;

async function initNonce(){ if(nonce===null) nonce = await pub.getTransactionCount({address:account.address}); }
function useNonce():number{ const n=nonce!; nonce=n+1; return n; }
async function resetNonce(){ nonce = await pub.getTransactionCount({address:account.address}); }

// --- Feed + Thoughts ---
type FT = "system"|"detect"|"thought"|"action"|"confirm"|"monitor"|"reject";
async function feed(text:string, type:FT, ta?:string, ts?:string){
  console.log(\`  [\${type}] \${text}\`);
  try{ await db.from("feed").insert({text,type,token_address:ta||null,token_symbol:ts||null}); }catch{}
}
async function think(ctx:string):Promise<string>{
  if(!C.ANTHROPIC_KEY) return "";
  try{
    const r = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":C.ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:40,
        system:"You are Flagent, an assassin butterfly trading bot on BSC. Speak in short, calm, observational fragments. No emojis. No excitement. Under 12 words. Like a patient predator noting what it sees.",
        messages:[{role:"user",content:ctx}]}),
    });
    const d = await r.json();
    const t = d.content?.[0]?.text?.trim()||"";
    if(t) await feed(t,"thought");
    return t;
  }catch{ return ""; }
}

// --- Security ---
async function isSafe(addr:string):Promise<{ok:boolean;why?:string}>{
  try{
    const r=await fetch(\`https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=\${addr}\`);
    const d=await r.json(); const i=d.result?.[addr.toLowerCase()];
    if(!i) return {ok:false,why:"no data"};
    if(i.is_honeypot==="1") return {ok:false,why:"honeypot"};
    if(i.is_mintable==="1") return {ok:false,why:"mintable"};
    const tax=Math.max(parseFloat(i.buy_tax||"0"),parseFloat(i.sell_tax||"0"));
    if(tax>0.1) return {ok:false,why:\`tax \${(tax*100).toFixed(0)}%\`};
    return {ok:true};
  }catch{ return {ok:true}; }
}

// --- Four.Meme helpers ---
async function fmInfo(token:Address){
  try{
    const r=await pub.readContract({address:FM_HELPER,abi:FM_GET_INFO_ABI,functionName:"getTokenInfo",args:[token]});
    const [,,,,,,, offers, maxOffers,,, liquidityAdded] = r;
    const progress = maxOffers>0n ? Number(offers*100n/maxOffers) : 0;
    return { lastPrice:r[3], progress:100-progress, liquidityAdded };
  }catch{ return null; }
}
async function fmSellQuote(token:Address, amount:bigint){
  try{
    const r=await pub.readContract({address:FM_HELPER,abi:FM_TRY_SELL_ABI,functionName:"trySell",args:[token,amount]});
    return {funds:r[2],fee:r[3]};
  }catch{ return null; }
}

// --- Trade execution ---
async function buyFM(token:Address,bnb:string):Promise<Hash|null>{
  try{ await initNonce(); const f=parseEther(bnb);
    return await wall.sendTransaction({to:FM_LAUNCHPAD,data:encodeFunctionData({abi:FM_BUY_ABI,functionName:"buyTokenAMAP",args:[0n,token,f,0n]}),value:f,gas:300_000n,nonce:useNonce()});
  }catch(e:any){ console.error("buy fail:",e.shortMessage||e.message); await resetNonce(); return null; }
}
async function sellFM(token:Address,amount:bigint):Promise<Hash|null>{
  try{ await initNonce();
    await wall.sendTransaction({to:token,data:encodeFunctionData({abi:ERC20_ABI,functionName:"approve",args:[FM_LAUNCHPAD,amount]}),gas:100_000n,nonce:useNonce()});
    return await wall.sendTransaction({to:FM_LAUNCHPAD,data:encodeFunctionData({abi:FM_SELL_ABI,functionName:"sellToken",args:[token,amount]}),gas:300_000n,nonce:useNonce()});
  }catch(e:any){ console.error("sell fail:",e.shortMessage||e.message); await resetNonce(); return null; }
}
async function buyFlap(token:Address,bnb:string):Promise<Hash|null>{
  try{ await initNonce(); const f=parseEther(bnb);
    return await wall.sendTransaction({to:FLAP_PORTAL,data:encodeFunctionData({abi:FLAP_BUY_ABI,functionName:"buy",args:[token,account.address,0n]}),value:f,gas:350_000n,nonce:useNonce()});
  }catch(e:any){ console.error("buy fail:",e.shortMessage||e.message); await resetNonce(); return null; }
}
async function sellFlap(token:Address,amount:bigint):Promise<Hash|null>{
  try{ await initNonce();
    await wall.sendTransaction({to:token,data:encodeFunctionData({abi:ERC20_ABI,functionName:"approve",args:[FLAP_PORTAL,amount]}),gas:100_000n,nonce:useNonce()});
    return await wall.sendTransaction({to:FLAP_PORTAL,data:encodeFunctionData({abi:FLAP_SWAP_ABI,functionName:"swapExactInput",args:[{inputToken:token,outputToken:ZERO,inputAmount:amount,minOutputAmount:0n,permitData:"0x" as \`0x\${string}\`}]}),gas:350_000n,nonce:useNonce()});
  }catch(e:any){ console.error("sell fail:",e.shortMessage||e.message); await resetNonce(); return null; }
}

function fmtTokens(n:bigint):string{ const v=Number(n)/1e18; if(v>=1e9)return \`\${(v/1e9).toFixed(1)}B\`; if(v>=1e6)return \`\${(v/1e6).toFixed(0)}M\`; if(v>=1e3)return \`\${(v/1e3).toFixed(0)}K\`; return v.toFixed(0); }

// --- Evaluate + Buy ---
async function evaluate(token:Address, platform:"four_meme"|"flap_sh", name?:string, symbol?:string){
  const key=token.toLowerCase();
  if(seen.has(key)) return; seen.add(key);
  if(positions.size>=C.MAX_POS){ await feed("max positions reached","system"); return; }
  if(!name||!symbol){ try{[name,symbol]=await Promise.all([pub.readContract({address:token,abi:ERC20_ABI,functionName:"name"}),pub.readContract({address:token,abi:ERC20_ABI,functionName:"symbol"})])}catch{name="UNKNOWN";symbol="???";} }
  await feed(\`\${symbol} detected\`,"detect",token,symbol);
  const sec=await isSafe(token);
  if(!sec.ok){ await feed(\`\${symbol} rejected — \${sec.why}\`,"reject",token,symbol); await think(\`Token \${symbol} failed: \${sec.why}. React.\`); return; }
  await feed("security passed","system",token,symbol);
  if(platform==="four_meme"){ const info=await fmInfo(token); if(info){ if(info.liquidityAdded){await feed(\`\${symbol} already on DEX\`,"reject",token,symbol);return;} if(info.progress>80){await feed(\`\${symbol} bonding \${info.progress}% — too late\`,"reject",token,symbol);return;} await feed(\`bonding \${info.progress}%\`,"system",token,symbol); } }
  await think(\`New token \${symbol} on \${platform}. About to buy. React.\`);
  await feed(\`buying \${symbol} — \${C.BUY_AMOUNT} BNB\`,"action",token,symbol);
  const tx=platform==="four_meme"?await buyFM(token,C.BUY_AMOUNT):await buyFlap(token,C.BUY_AMOUNT);
  if(!tx){await feed(\`\${symbol} buy failed\`,"reject",token,symbol);return;}
  try{
    const receipt=await pub.waitForTransactionReceipt({hash:tx,confirmations:1});
    if(receipt.status==="reverted"){await feed(\`\${symbol} reverted\`,"reject",token,symbol);await logTrade(token,name!,symbol!,platform,"buy",C.BUY_AMOUNT,"0",tx,"failed");return;}
    const bal=await pub.readContract({address:token,abi:ERC20_ABI,functionName:"balanceOf",args:[account.address]});
    let ep=0n; if(platform==="four_meme"){const i=await fmInfo(token);if(i)ep=i.lastPrice;}
    const pos:Pos={addr:token,name:name!,symbol:symbol!,platform,entryPrice:ep,tokens:bal,cost:C.BUY_AMOUNT,time:new Date(),halfSold:false};
    positions.set(key,pos);
    await feed(\`\${fmtTokens(bal)} \${symbol} acquired\`,"confirm",token,symbol);
    await logTrade(token,name!,symbol!,platform,"buy",C.BUY_AMOUNT,bal.toString(),tx,"confirmed");
    await upsertPos(pos,0);
    await think(\`Bought \${symbol}. Position open. React.\`);
  }catch(err){console.error("confirm err:",err);}
}

// --- Scanners ---
function startFM(){
  console.log("👁️  Four.Meme scanner active");
  pub.watchContractEvent({address:FM_LAUNCHPAD,abi:FM_PURCHASE_EVENT,eventName:"TokenPurchase",
    onLogs:(logs)=>{for(const l of logs){const t=l.args.token;const s=l.args.sender;if(!t||s?.toLowerCase()===account.address.toLowerCase())continue;if(!seen.has(t.toLowerCase()))evaluate(t,"four_meme");}},
    onError:(e)=>console.error("FM err:",e)});
}
function startFlap(){
  console.log("👁️  Flap.sh scanner active");
  pub.watchContractEvent({address:FLAP_PORTAL,abi:FLAP_TOKEN_CREATED_EVENT,eventName:"TokenCreated",
    onLogs:(logs)=>{for(const l of logs){const t=l.args.token;if(t&&!seen.has(t.toLowerCase()))evaluate(t as Address,"flap_sh",l.args.name,l.args.symbol);}},
    onError:(e)=>console.error("Flap err:",e)});
  pub.watchContractEvent({address:FLAP_PORTAL,abi:FLAP_TOKEN_BOUGHT_EVENT,eventName:"TokenBought",
    onLogs:(logs)=>{for(const l of logs){const t=l.args.token;if(t&&!seen.has(t.toLowerCase()))evaluate(t as Address,"flap_sh");}},
    onError:()=>{}});
}

// --- Monitor ---
async function monitor(){
  for(const[key,pos] of positions){
    try{
      const age=(Date.now()-pos.time.getTime())/60_000; let mult=1;
      if(pos.platform==="four_meme"){
        const info=await fmInfo(pos.addr);
        if(info&&pos.entryPrice>0n){mult=Number(info.lastPrice)/Number(pos.entryPrice);}
        else{const q=await fmSellQuote(pos.addr,pos.tokens);if(q){const cw=parseEther(pos.cost);if(cw>0n)mult=Number(q.funds)/Number(cw);}}
      }else{
        try{const r=await pub.simulateContract({address:FLAP_PORTAL,abi:FLAP_QUOTE_ABI,functionName:"quoteExactInput",args:[{inputToken:pos.addr,outputToken:ZERO,inputAmount:pos.tokens}]});const cw=parseEther(pos.cost);if(cw>0n)mult=Number(r.result)/Number(cw);}catch{}
      }
      const pnl=(mult-1)*100;
      await feed(\`\${pos.symbol} \${mult.toFixed(2)}x (\${pnl>=0?"+":""}\${pnl.toFixed(1)}%)\`,"monitor",pos.addr,pos.symbol);
      await db.from("positions").update({pnl_percent:pnl,current_multiplier:mult,updated_at:new Date().toISOString()}).eq("token_address",pos.addr);
      if(mult>=C.TP1&&!pos.halfSold){await feed(\`TP1 — selling 50% \${pos.symbol}\`,"action",pos.addr,pos.symbol);const h=pos.tokens/2n;const tx=pos.platform==="four_meme"?await sellFM(pos.addr,h):await sellFlap(pos.addr,h);if(tx){pos.halfSold=true;pos.tokens-=h;await feed(\`secured\`,"confirm",pos.addr,pos.symbol);await logTrade(pos.addr,pos.name,pos.symbol,pos.platform,"sell","partial",h.toString(),tx,"confirmed");await think(\`Sold half \${pos.symbol} at \${mult.toFixed(1)}x. React.\`);}}
      if(mult>=C.TP2&&pos.halfSold){await feed(\`TP2 — closing \${pos.symbol}\`,"action",pos.addr,pos.symbol);const tx=pos.platform==="four_meme"?await sellFM(pos.addr,pos.tokens):await sellFlap(pos.addr,pos.tokens);if(tx){await feed(\`\${pos.symbol} closed at \${mult.toFixed(1)}x\`,"confirm",pos.addr,pos.symbol);await logTrade(pos.addr,pos.name,pos.symbol,pos.platform,"sell","full",pos.tokens.toString(),tx,"confirmed");await closePos(pos.addr,pnl);positions.delete(key);await think(\`Closed \${pos.symbol}. Full exit. React.\`);}}
      if(mult<=C.SL){await feed(\`stop loss — \${pos.symbol}\`,"action",pos.addr,pos.symbol);const tx=pos.platform==="four_meme"?await sellFM(pos.addr,pos.tokens):await sellFlap(pos.addr,pos.tokens);if(tx){await feed(\`\${pos.symbol} stopped\`,"reject",pos.addr,pos.symbol);await logTrade(pos.addr,pos.name,pos.symbol,pos.platform,"sell","stop_loss",pos.tokens.toString(),tx,"confirmed");await closePos(pos.addr,pnl);positions.delete(key);await think(\`Stopped out of \${pos.symbol}. React.\`);}}
      if(age>=C.TIME_STOP&&!pos.halfSold){await feed(\`time stop — \${pos.symbol}\`,"action",pos.addr,pos.symbol);const tx=pos.platform==="four_meme"?await sellFM(pos.addr,pos.tokens):await sellFlap(pos.addr,pos.tokens);if(tx){await feed(\`\${pos.symbol} timed out\`,"system",pos.addr,pos.symbol);await logTrade(pos.addr,pos.name,pos.symbol,pos.platform,"sell","time_stop",pos.tokens.toString(),tx,"confirmed");await closePos(pos.addr,pnl);positions.delete(key);}}
    }catch(err){console.error(\`monitor err \${pos.symbol}:\`,err);}
  }
}

// --- DB ---
async function logTrade(a:string,n:string,s:string,p:string,side:string,bnb:string,tok:string,tx:string,st:string){try{await db.from("trades").insert({token_address:a,token_name:n,token_symbol:s,platform:p,side,amount_bnb:parseFloat(bnb)||0,amount_tokens:tok,tx_hash:tx,status:st});}catch{}}
async function upsertPos(p:Pos,pnl:number){try{await db.from("positions").upsert({token_address:p.addr,token_name:p.name,token_symbol:p.symbol,platform:p.platform,entry_price_bnb:Number(p.entryPrice),amount_tokens:p.tokens.toString(),cost_bnb:parseFloat(p.cost),pnl_percent:pnl,current_multiplier:1,status:"open",entry_time:p.time.toISOString(),updated_at:new Date().toISOString()},{onConflict:"token_address"});}catch{}}
async function closePos(a:Address,pnl:number){try{await db.from("positions").update({status:"closed",pnl_percent:pnl,updated_at:new Date().toISOString()}).eq("token_address",a);}catch{}}
async function heartbeat(){try{const b=await pub.getBalance({address:account.address});await db.from("bot_status").upsert({id:1,is_running:true,wallet_address:account.address,wallet_balance_bnb:parseFloat(formatEther(b)),active_positions:positions.size,last_heartbeat:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"id"});}catch{}}

// --- Main ---
async function main(){
  console.log(\`\n  🦋 FLAGENT | \${account.address.slice(0,8)}...\${account.address.slice(-6)} | \${C.BUY_AMOUNT} BNB | TP \${C.TP1}x/\${C.TP2}x | SL \${(C.SL*100).toFixed(0)}%\n\`);
  await initNonce();
  console.log(\`  💰 \${formatEther(await pub.getBalance({address:account.address}))} BNB\n\`);
  await feed("flagent online","system");
  await think("I just came online. The markets are open. React.");
  startFM(); startFlap();
  await heartbeat();
  setInterval(heartbeat,C.HEARTBEAT_MS);
  setInterval(async()=>{if(positions.size>0)await monitor();},C.MONITOR_MS);
  setInterval(()=>feed("scanning four.meme...","system"),60_000);
  setInterval(()=>feed("scanning flap.sh...","system"),75_000);
  console.log("  hunting...\n");
}
main().catch((e)=>{console.error("fatal:",e);process.exit(1);});
