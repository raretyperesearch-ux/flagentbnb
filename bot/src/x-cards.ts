// =====================================================
// FLAGENT X ENGINE — STAT CARD RENDERER
// satori + @resvg/resvg-js → PNG images for tweets
// Cards: daily report, research drop, portfolio, token analysis
// =====================================================

import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";

// ── DIMENSIONS ──

var W = 800;
var H = 420;

// ── COLORS (matching flagent.pro) ──

var gold = "#c9a84c";
var bg = "#0c0b08";
var muted = "#3a3530";
var txt = "#6b6255";
var green = "#7a9a5a";
var red = "#6a4a3a";
var border = "rgba(201,168,76,0.12)";

// ── FONTS ──

var fonts: { name: string; data: ArrayBuffer; weight: number; style: string }[] = [];

export async function loadFonts(): Promise<void> {
  try {
    var pairs = [
      { family: "IBM Plex Mono", weight: 400, style: "normal" },
      { family: "IBM Plex Mono", weight: 500, style: "normal" },
      { family: "IBM Plex Mono", weight: 400, style: "italic" },
    ];

    fonts = await Promise.all(
      pairs.map(async function (p) {
        var ital = p.style === "italic" ? "ital,wght@1," + p.weight : "wght@" + p.weight;
        var cssUrl = "https://fonts.googleapis.com/css2?family=" +
          p.family.replace(/ /g, "+") + ":" + ital + "&display=swap";

        // old Safari UA → Google returns TTF format
        var cssRes = await fetch(cssUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
          },
        });
        var css = await cssRes.text();
        var match = css.match(/url\((.+?\.ttf)\)/);
        if (!match) throw new Error("TTF URL not found for " + p.family + " " + p.weight);

        var fontData = await fetch(match[1]).then(function (r) { return r.arrayBuffer(); });
        return { name: p.family, data: fontData, weight: p.weight, style: p.style };
      })
    );

    console.log("[cards] fonts loaded: " + fonts.length);
  } catch (e) {
    console.error("[cards] font load failed:", e);
  }
}

// ── CORE RENDER ──

async function render(markup: any, width: number = W, height: number = H): Promise<Buffer> {
  var svg = await satori(markup, {
    width: width,
    height: height,
    fonts: fonts,
  });

  var resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });

  return Buffer.from(resvg.render().asPng());
}

// ── SHARED MARKUP HELPERS ──

function header(subtitle: string, rightText?: string) {
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
      <div style="display:flex; flex-direction:column;">
        <span style="font-size:20px; font-weight:500; letter-spacing:0.22em; color:${gold}; opacity:0.8;">FLAGENT</span>
        <span style="font-size:10px; letter-spacing:0.18em; color:${muted}; margin-top:4px;">${subtitle}</span>
      </div>
      ${rightText
        ? `<span style="font-size:9px; letter-spacing:0.15em; color:${muted};">${rightText}</span>`
        : `<div style="display:flex; width:7px; height:7px; border-radius:50%; background:${green};"></div>`
      }
    </div>
  `;
}

function footer(center: string) {
  return `
    <div style="display:flex; justify-content:center; margin-top:auto; padding-top:14px;">
      <span style="font-size:8px; letter-spacing:0.3em; color:${muted}; opacity:0.6;">${center}</span>
    </div>
  `;
}

function stat(label: string, value: string, color: string) {
  return `
    <div style="display:flex; flex-direction:column; flex:1;">
      <span style="font-size:8px; letter-spacing:0.2em; color:${muted}; margin-bottom:4px;">${label}</span>
      <span style="font-size:22px; color:${color};">${value}</span>
    </div>
  `;
}

function divider() {
  return `<div style="display:flex; width:100%; height:1px; background:${border}; margin:14px 0;"></div>`;
}

function dateStr() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

// ── DATA INTERFACES ──

export interface DailyData {
  scanned: number;
  buys: number;
  sells: number;
  open: number;
  winRate: string;
  totalPnl: string;
  balance: string;
  bestTrade?: { symbol: string; mult: string };
  worstTrade?: { symbol: string; mult: string };
}

export interface ResearchData {
  title: string;
  metrics: { label: string; value: string }[];
  categories?: { name: string; count: number }[];
  insight: string;
}

export interface PortfolioData {
  positions: { symbol: string; mult: number; pnl: number; platform: string }[];
  totalDeployed: string;
  unrealizedPnl: string;
}

export interface TokenData {
  name: string;
  symbol: string;
  address: string;
  platform: string;
  bonding: string;
  buyers: string;
  age: string;
  security: string;
  tax: string;
  honeypot: boolean;
  verdict: "BUY" | "SKIP" | "AVOID";
  insight: string;
}

// =====================================================
// CARD RENDERERS
// =====================================================

// ── DAILY REPORT CARD ──

export async function renderDailyCard(d: DailyData): Promise<Buffer> {
  var pnlColor = d.totalPnl.startsWith("+") ? green : d.totalPnl.startsWith("-") ? red : txt;

  var bestWorst = "";
  if (d.bestTrade || d.worstTrade) {
    bestWorst = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end;">
        ${d.bestTrade ? `
          <div style="display:flex; flex-direction:column;">
            <span style="font-size:8px; letter-spacing:0.18em; color:${muted}; margin-bottom:3px;">BEST</span>
            <span style="font-size:14px; color:${green};">${d.bestTrade.symbol} ${d.bestTrade.mult}</span>
          </div>
        ` : ""}
        ${d.worstTrade ? `
          <div style="display:flex; flex-direction:column;">
            <span style="font-size:8px; letter-spacing:0.18em; color:${muted}; margin-bottom:3px;">WORST</span>
            <span style="font-size:14px; color:${red};">${d.worstTrade.symbol} ${d.worstTrade.mult}</span>
          </div>
        ` : ""}
        <div style="display:flex; flex-direction:column;">
          <span style="font-size:8px; letter-spacing:0.18em; color:${muted}; margin-bottom:3px;">BALANCE</span>
          <span style="font-size:14px; color:${txt};">${d.balance} BNB</span>
        </div>
      </div>
    `;
  }

  var markup = html`
    <div style="display:flex; flex-direction:column; width:${W}px; height:${H}px; background:${bg}; padding:28px 36px; font-family:IBM Plex Mono;">
      ${header("DAILY REPORT")}
      <div style="display:flex; margin-bottom:10px;">
        ${stat("SCANNED", d.scanned.toLocaleString(), txt)}
        ${stat("BUYS", String(d.buys), gold)}
        ${stat("SELLS", String(d.sells), txt)}
      </div>
      <div style="display:flex; margin-bottom:6px;">
        ${stat("OPEN", String(d.open), gold)}
        ${stat("WIN RATE", d.winRate, green)}
        ${stat("PNL", d.totalPnl + " BNB", pnlColor)}
      </div>
      ${divider()}
      ${bestWorst}
      ${footer("flagent.pro  ·  BSC  ·  " + dateStr())}
    </div>
  `;

  return render(markup);
}

// ── RESEARCH DROP CARD ──

export async function renderResearchCard(d: ResearchData): Promise<Buffer> {
  var metricsHtml = d.metrics.map(function (m, i) {
    var c = i === 0 ? txt : i === 1 ? green : gold;
    return `
      <div style="display:flex; flex-direction:column; flex:1;">
        <span style="font-size:8px; letter-spacing:0.15em; color:${muted}; margin-bottom:4px;">${m.label}</span>
        <span style="font-size:18px; color:${c};">${m.value}</span>
      </div>
    `;
  }).join("");

  var barsHtml = "";
  if (d.categories && d.categories.length > 0) {
    var maxCount = Math.max.apply(null, d.categories.map(function (c) { return c.count; }));

    barsHtml = `
      <div style="display:flex; flex-direction:column; margin-top:14px; margin-bottom:10px;">
        <span style="font-size:8px; letter-spacing:0.2em; color:${muted}; margin-bottom:10px;">GRADUATION BY CATEGORY</span>
        ${d.categories.map(function (c) {
          var pct = maxCount > 0 ? Math.round((c.count / maxCount) * 100) : 0;
          return `
            <div style="display:flex; align-items:center; margin-bottom:5px;">
              <span style="font-size:10px; color:${txt}; width:70px; text-align:right; margin-right:10px;">${c.name}</span>
              <div style="display:flex; flex:1; height:12px; background:rgba(201,168,76,0.06); border-radius:2px; overflow:hidden;">
                <div style="display:flex; width:${pct}%; height:100%; background:linear-gradient(90deg, rgba(201,168,76,0.2), rgba(201,168,76,0.55)); border-radius:2px;"></div>
              </div>
              <span style="font-size:10px; color:${gold}; opacity:0.7; width:28px; text-align:right; margin-left:8px;">${c.count}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  var h2 = d.categories ? 520 : H;

  var markup = html`
    <div style="display:flex; flex-direction:column; width:${W}px; height:${h2}px; background:${bg}; padding:28px 36px; font-family:IBM Plex Mono;">
      ${header(d.title, "DUNE")}
      <div style="display:flex;">${metricsHtml}</div>
      ${barsHtml}
      ${divider()}
      <div style="display:flex; padding:2px 0;">
        <span style="font-size:11px; font-style:italic; color:${txt}; line-height:1.7;">"${d.insight}"</span>
      </div>
      ${footer("flagent.pro  ·  ON-CHAIN DATA  ·  " + dateStr())}
    </div>
  `;

  return render(markup, W, h2);
}

// ── PORTFOLIO CARD ──

export async function renderPortfolioCard(d: PortfolioData): Promise<Buffer> {
  var pnlColor = d.unrealizedPnl.startsWith("+") ? green : d.unrealizedPnl.startsWith("-") ? red : txt;
  var positions = d.positions.slice(0, 6); // max 6 rows
  var cardH = 280 + positions.length * 34;

  var rowsHtml = positions.map(function (p, i) {
    var isUp = p.pnl > 0;
    var c = isUp ? green : red;
    var borderBottom = i < positions.length - 1
      ? "border-bottom:1px solid rgba(58,53,48,0.25);"
      : "";
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; ${borderBottom}">
        <span style="font-size:13px; color:${txt}; font-weight:500; width:100px;">${p.symbol}</span>
        <span style="font-size:13px; color:${c}; width:70px; text-align:center;">${p.mult.toFixed(2)}x</span>
        <span style="font-size:13px; color:${c}; width:70px; text-align:right;">${isUp ? "+" : ""}${p.pnl.toFixed(1)}%</span>
        <span style="font-size:9px; color:${muted}; width:90px; text-align:right;">${p.platform}</span>
      </div>
    `;
  }).join("");

  var markup = html`
    <div style="display:flex; flex-direction:column; width:${W}px; height:${cardH}px; background:${bg}; padding:28px 36px; font-family:IBM Plex Mono;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
        <div style="display:flex; flex-direction:column;">
          <span style="font-size:20px; font-weight:500; letter-spacing:0.22em; color:${gold}; opacity:0.8;">FLAGENT</span>
          <span style="font-size:10px; letter-spacing:0.18em; color:${muted}; margin-top:4px;">OPEN POSITIONS</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end;">
          <span style="font-size:8px; letter-spacing:0.15em; color:${muted}; margin-bottom:3px;">UNREALIZED</span>
          <span style="font-size:18px; color:${pnlColor};">${d.unrealizedPnl} BNB</span>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; padding:0 0 6px; margin-bottom:4px; border-bottom:1px solid ${border};">
        <span style="font-size:7px; letter-spacing:0.18em; color:${muted}; width:100px;">TOKEN</span>
        <span style="font-size:7px; letter-spacing:0.18em; color:${muted}; width:70px; text-align:center;">MULT</span>
        <span style="font-size:7px; letter-spacing:0.18em; color:${muted}; width:70px; text-align:right;">PNL</span>
        <span style="font-size:7px; letter-spacing:0.18em; color:${muted}; width:90px; text-align:right;">PLATFORM</span>
      </div>

      <div style="display:flex; flex-direction:column;">
        ${rowsHtml}
      </div>

      <div style="display:flex; margin-top:12px;">
        <span style="font-size:9px; color:${muted};">${d.totalDeployed} BNB deployed across ${positions.length} positions</span>
      </div>

      ${footer("flagent.pro  ·  LIVE POSITIONS  ·  " + dateStr())}
    </div>
  `;

  return render(markup, W, cardH);
}

// ── TOKEN ANALYSIS CARD ──

export async function renderTokenCard(d: TokenData): Promise<Buffer> {
  var verdictColor = d.verdict === "BUY" ? green : d.verdict === "SKIP" ? gold : red;
  var verdictBorder = d.verdict === "BUY" ? green + "55" : d.verdict === "SKIP" ? gold + "44" : red + "55";

  var secColor = d.security === "CLEAN" ? green : red;
  var hpColor = d.honeypot ? red : green;

  var markup = html`
    <div style="display:flex; flex-direction:column; width:${W}px; height:${H}px; background:${bg}; padding:28px 36px; font-family:IBM Plex Mono;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div style="display:flex; flex-direction:column;">
          <span style="font-size:20px; font-weight:500; letter-spacing:0.22em; color:${gold}; opacity:0.8;">FLAGENT</span>
          <span style="font-size:10px; letter-spacing:0.18em; color:${muted}; margin-top:4px;">TOKEN ANALYSIS</span>
        </div>
        <div style="display:flex; padding:4px 12px; border:1px solid ${verdictBorder}; border-radius:3px;">
          <span style="font-size:11px; letter-spacing:0.12em; color:${verdictColor};">${d.verdict}</span>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; margin-bottom:14px;">
        <span style="font-size:24px; color:${gold}; margin-bottom:3px;">${d.symbol}</span>
        <span style="font-size:9px; color:${muted};">${d.address.slice(0, 6)}...${d.address.slice(-4)}  ·  ${d.platform}</span>
      </div>

      <div style="display:flex; margin-bottom:8px;">
        ${stat("BONDING", d.bonding, gold)}
        ${stat("BUYERS", d.buyers, green)}
        ${stat("AGE", d.age, txt)}
      </div>
      <div style="display:flex; margin-bottom:4px;">
        ${stat("SECURITY", d.security, secColor)}
        ${stat("TAX", d.tax, d.tax === "0%" ? green : red)}
        ${stat("HONEYPOT", d.honeypot ? "YES" : "NO", hpColor)}
      </div>

      ${divider()}

      <div style="display:flex;">
        <span style="font-size:11px; font-style:italic; color:${txt}; line-height:1.7;">"${d.insight}"</span>
      </div>

      ${footer("flagent.pro  ·  GOPLUS VERIFIED  ·  " + dateStr())}
    </div>
  `;

  return render(markup);
}
