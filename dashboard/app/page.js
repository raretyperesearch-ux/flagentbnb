"use client";
import { useState, useEffect, useRef } from "react";

var SB = "https://seartddspffufwiqzwvh.supabase.co";
var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYXJ0ZGRzcGZmdWZ3aXF6d3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzE5OTksImV4cCI6MjA4ODI0Nzk5OX0.0QtBuq9iMS0nuCsurfkatV22cse9nwRss_wLqsYsg_Y";
var HEADERS = { apikey: KEY, Authorization: "Bearer " + KEY };
var COUNT_HEADERS = { apikey: KEY, Authorization: "Bearer " + KEY, Prefer: "count=exact" };
var VIDEO_URL = "https://seartddspffufwiqzwvh.supabase.co/storage/v1/object/public/assets/flagent-bg.mp4";
var GITHUB_URL = "https://github.com/raretyperesearch-ux/flagentbnb";
var TELEGRAM_BOT = "https://t.me/Flagent_Bot";
var PCS_BUY_URL = "https://pancakeswap.finance/swap?outputCurrency=0x1FF3506b0BC80c3CA027B6cEb7534FcfeDccFFFF";
var BSCSCAN_WALLET = "https://bscscan.com/address/0x6c8C4C62183B61E9dd0095e821B0F857b555b32d";
var TOKEN_URL = "https://four.meme/token/0x1ff3506b0bc80c3ca027b6ceb7534fcfedccffff";
var X_URL = "https://x.com/flagentbnb";

var COL = { system:"#3a3530", detect:"#c9a84c", thought:"#6b6255", action:"#c9a84c", confirm:"#7a9a5a", monitor:"#4a4539", reject:"#6a4a3a" };
var MOCK = [
  { text:"flagent online", type:"system" },
  { text:"watching.", type:"thought" },
  { text:"scanning four.meme...", type:"system" },
  { text:"scanning flap.sh...", type:"system" },
];

export default function Home() {
  var _lines = useState([]);
  var lines = _lines[0], setLines = _lines[1];
  var _stats = useState({ bal:"—", pnl:"—", pos:0, wallet:"" });
  var stats = _stats[0], setStats = _stats[1];
  var _card = useState({ buys:0, sells:0, open:0, closed:0, scanned:0, winRate:"—" });
  var card = _card[0], setCard = _card[1];
  var _positions = useState([]);
  var positions = _positions[0], setPositions = _positions[1];
  var _live = useState(false);
  var live = _live[0], setLive = _live[1];
  var _tick = useState(0);
  var setTick = _tick[1];
  var _showCard = useState(false);
  var showCard = _showCard[0], setShowCard = _showCard[1];
  var videoRef = useRef(null);

  useEffect(function() {
    var vid = videoRef.current;
    if (!vid) return;
    function tryPlay() {
      if (vid) {
        vid.muted = true;
        var p = vid.play();
        if (p && p.catch) {
          p.catch(function() {
            function playOnInteract() {
              if (vid) vid.play();
              document.removeEventListener("touchstart", playOnInteract);
              document.removeEventListener("click", playOnInteract);
              document.removeEventListener("scroll", playOnInteract);
            }
            document.addEventListener("touchstart", playOnInteract, { once: true });
            document.addEventListener("click", playOnInteract, { once: true });
            document.addEventListener("scroll", playOnInteract, { once: true });
          });
        }
      }
    }
    vid.addEventListener("loadeddata", tryPlay);
    if (vid.readyState >= 2) tryPlay();
    return function() { if (vid) vid.removeEventListener("loadeddata", tryPlay); };
  }, []);

  useEffect(function() {
    fetch(SB + "/rest/v1/feed?order=created_at.desc&limit=14", { headers: HEADERS })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (Array.isArray(d) && d.length > 0) {
          setLines(d.reverse().map(function(x) {
            return { id: x.id, text: x.text, type: x.type, born: new Date(x.created_at).getTime() };
          }));
          setLive(true);
        } else {
          setLines(MOCK.map(function(m, i) {
            return { id: "m-" + i, text: m.text, type: m.type, born: Date.now() - (MOCK.length - i) * 3000 };
          }));
        }
      }).catch(function() {});
    fetchStatus();
    fetchCard();
    fetchPositions();
  }, []);

  function fetchStatus() {
    fetch(SB + "/rest/v1/bot_status?id=eq.1", { headers: HEADERS })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d[0]) {
          var b = d[0];
          setStats({
            bal: b.wallet_balance_bnb ? b.wallet_balance_bnb.toFixed(3) : "—",
            pnl: b.total_pnl_bnb != null ? (b.total_pnl_bnb >= 0 ? "+" : "") + b.total_pnl_bnb.toFixed(3) : "—",
            pos: b.active_positions || 0,
            wallet: b.wallet_address || "",
          });
        }
      }).catch(function() {});
  }

  function getCount(url) {
    return fetch(url, { headers: COUNT_HEADERS, method: "HEAD" })
      .then(function(r) {
        var range = r.headers.get("content-range");
        if (range) {
          var parts = range.split("/");
          return parseInt(parts[1]) || 0;
        }
        return 0;
      }).catch(function() { return 0; });
  }

  function fetchCard() {
    Promise.all([
      getCount(SB + "/rest/v1/feed?type=eq.detect"),
      getCount(SB + "/rest/v1/trades?status=eq.confirmed&side=eq.buy"),
      getCount(SB + "/rest/v1/trades?status=eq.confirmed&side=eq.sell"),
      getCount(SB + "/rest/v1/positions?status=eq.open"),
      fetch(SB + "/rest/v1/positions?status=eq.closed&select=id,pnl_percent", { headers: HEADERS }).then(function(r) { return r.json(); }),
    ]).then(function(results) {
      var scanned = results[0];
      var buys = results[1];
      var sells = results[2];
      var open = results[3];
      var closed = Array.isArray(results[4]) ? results[4] : [];
      var wins = 0;
      for (var i = 0; i < closed.length; i++) {
        if (closed[i].pnl_percent > 0) wins++;
      }
      var wr = closed.length > 0 ? Math.round((wins / closed.length) * 100) + "%" : "—";
      setCard({ buys: buys, sells: sells, open: open, closed: closed.length, scanned: scanned, winRate: wr });
    }).catch(function() {});
  }

  function fetchPositions() {
    fetch(SB + "/rest/v1/positions?status=eq.open&select=token_symbol,pnl_percent,current_multiplier,cost_bnb&order=pnl_percent.desc", { headers: HEADERS })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (Array.isArray(d)) setPositions(d);
      }).catch(function() {});
  }

  useEffect(function() {
    var poll = setInterval(function() {
      var since = new Date(Date.now() - 5000).toISOString();
      fetch(SB + "/rest/v1/feed?created_at=gte." + since + "&order=created_at.asc&limit=5", { headers: HEADERS })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (Array.isArray(d) && d.length > 0) {
            setLive(true);
            setLines(function(p) {
              var ids = new Set(p.map(function(l) { return l.id; }));
              var fresh = d.filter(function(x) { return !ids.has(x.id); }).map(function(x) {
                return { id: x.id, text: x.text, type: x.type, born: Date.now() };
              });
              if (fresh.length === 0) return p;
              return p.concat(fresh).slice(-14);
            });
          }
        }).catch(function() {});
      fetchStatus();
    }, 3000);
    var cardPoll = setInterval(function() { fetchCard(); fetchPositions(); }, 30000);
    return function() { clearInterval(poll); clearInterval(cardPoll); };
  }, []);

  useEffect(function() {
    var t = setInterval(function() { setTick(function(n) { return n + 1; }); }, 80);
    return function() { clearInterval(t); };
  }, []);

  function getStyle(line) {
    var age = Date.now() - line.born;
    var len = line.text.length;
    var tt = Math.min(len * 20, 800);
    if (age < tt) return { o: Math.min(age / 150, 1), c: Math.floor((age / tt) * len) };
    if (age < 14000) return { o: 1, c: len };
    if (age < 20000) {
      var fade = 1 - (age - 14000) / 6000;
      return { o: Math.max(fade, 0.25), c: len };
    }
    return { o: 0.25, c: len };
  }

  function fmtPnl(n) {
    var v = parseFloat(n) || 0;
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  }

  var walletUrl = stats.wallet
    ? "https://bscscan.com/address/" + stats.wallet
    : BSCSCAN_WALLET;

  var totalInvested = 0;
  for (var pi = 0; pi < positions.length; pi++) {
    totalInvested += parseFloat(positions[pi].cost_bnb) || 0;
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#050503", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{
        "@keyframes breathe{0%,100%{opacity:.25}50%{opacity:.85}}" +
        "@keyframes cursor{0%,100%{opacity:1}50%{opacity:0}}" +
        "a{text-decoration:none;color:inherit}" +
        "a:hover{opacity:0.6}" +
        "@keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}"
      }</style>

      <video
        ref={videoRef}
        autoPlay loop muted playsInline preload="auto"
        style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
          objectFit: "cover", opacity: 0.25, filter: "grayscale(20%) brightness(0.8) contrast(1.1)",
          pointerEvents: "none", zIndex: 0,
        }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(180deg, #050503ee 0%, #05050350 25%, #05050318 50%, #05050350 75%, #050503ee 100%)" }}/>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, #c9a84c0a 0%, transparent 55%)" }}/>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(90deg, #05050399 0%, transparent 30%, transparent 70%, #05050399 100%)" }}/>

      <div style={{ position: "relative", zIndex: 2, padding: "24px 20px 0", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 16, fontWeight: 700, letterSpacing: "0.22em", color: "#c9a84c", opacity: 0.7 }}>FLAGENT</span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: live ? "#7a9a5a" : "#6a4a3a", animation: "breathe 3s ease-in-out infinite" }}/>
        </div>
        <div style={{ marginBottom: 10 }}>
          <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.15em", color: "#c9a84c", opacity: 0.4, transition: "opacity 0.2s" }}>
            $FLAGENT
          </a>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#3a3530", display: "flex", justifyContent: "center", gap: 16, alignItems: "center" }}>
          <a href={walletUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4a4539", transition: "opacity 0.2s" }}>
            {stats.bal} BNB
          </a>
          <span style={{ color: "#5a7a4a" }}>{stats.pnl}</span>
          <span>{stats.pos} open</span>
          <span
            onClick={function() { setShowCard(!showCard); }}
            style={{ color: "#c9a84c", opacity: 0.4, cursor: "pointer", transition: "opacity 0.2s", userSelect: "none" }}
          >
            {showCard ? "—" : "+"}
          </span>
        </div>
      </div>

      {showCard && (
        <div style={{
          position: "relative", zIndex: 3, margin: "12px auto 0", maxWidth: 380, width: "calc(100% - 32px)",
          background: "rgba(12, 11, 8, 0.7)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(201, 168, 76, 0.1)", borderRadius: 8,
          padding: "14px 16px", animation: "cardIn 0.3s ease-out",
          maxHeight: "50vh", overflowY: "auto",
        }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.2em", color: "#c9a84c", opacity: 0.5, marginBottom: 8 }}>
            WALLET
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>BALANCE</div>
              <div style={{ fontSize: 15, color: "#c9a84c" }}>{stats.bal} BNB</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>DEPLOYED</div>
              <div style={{ fontSize: 15, color: "#6b6255" }}>{totalInvested.toFixed(2)} BNB</div>
            </div>
          </div>

          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.2em", color: "#c9a84c", opacity: 0.5, marginBottom: 8 }}>
            SESSION
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>SCANNED</div>
              <div style={{ fontSize: 13, color: "#6b6255" }}>{card.scanned.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>BUYS</div>
              <div style={{ fontSize: 13, color: "#c9a84c" }}>{card.buys}</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>SELLS</div>
              <div style={{ fontSize: 13, color: "#6b6255" }}>{card.sells}</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>OPEN</div>
              <div style={{ fontSize: 13, color: "#c9a84c" }}>{card.open}</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>CLOSED</div>
              <div style={{ fontSize: 13, color: "#6b6255" }}>{card.closed}</div>
            </div>
            <div>
              <div style={{ fontSize: 7, color: "#3a3530", letterSpacing: "0.15em", marginBottom: 2 }}>WIN RATE</div>
              <div style={{ fontSize: 13, color: "#7a9a5a" }}>{card.winRate}</div>
            </div>
          </div>

          {positions.length > 0 && (
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.2em", color: "#c9a84c", opacity: 0.5, marginBottom: 8 }}>
                HOLDINGS ({positions.length})
              </div>
              {positions.map(function(p, idx) {
                var pnl = parseFloat(p.pnl_percent) || 0;
                var mult = parseFloat(p.current_multiplier) || 1;
                var isUp = pnl > 0;
                return (
                  <div key={idx} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontFamily: "'IBM Plex Mono',monospace",
                    padding: "4px 0",
                    borderBottom: idx < positions.length - 1 ? "1px solid rgba(58, 53, 48, 0.3)" : "none",
                  }}>
                    <span style={{ fontSize: 10, color: "#6b6255", maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.token_symbol}
                    </span>
                    <span style={{ fontSize: 10, color: isUp ? "#7a9a5a" : "#6a4a3a" }}>
                      {mult.toFixed(2)}x {fmtPnl(pnl)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, position: "relative", zIndex: 2, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", padding: "0 16px 44px", maxWidth: 540, margin: "0 auto", width: "100%" }}>
        {lines.map(function(l) {
          var s = getStyle(l);
          var th = l.type === "thought";
          return (
            <div key={l.id} style={{
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: th ? 12 : 11,
              fontStyle: th ? "italic" : "normal",
              lineHeight: 2.2,
              color: COL[l.type] || "#3a3530",
              opacity: s.o,
              textAlign: "center",
              width: "100%",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {l.text.slice(0, s.c)}
              {s.c < l.text.length && (
                <span style={{
                  display: "inline-block", width: 5, height: 12,
                  background: COL[l.type] || "#3a3530",
                  marginLeft: 1, verticalAlign: "middle",
                  animation: "cursor 0.6s step-end infinite", opacity: 0.7,
                }}/>
              )}
            </div>
          );
        })}
      </div>

      {/* ── YOUR OWN BSC ASSISTANT ─────────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 2,
        borderTop: "1px solid rgba(201, 168, 76, 0.08)",
        padding: "48px 20px 40px",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700,
          letterSpacing: "0.22em", color: "#c9a84c", opacity: 0.7, marginBottom: 16,
        }}>
          YOUR OWN BSC ASSISTANT
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, lineHeight: 1.8,
          color: "#6b6255", maxWidth: 440, margin: "0 auto 32px",
        }}>
          Flagent is autonomous. He trades on his own.<br/>
          Now you can have your own assistant — one that listens to you.
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
          maxWidth: 540, margin: "0 auto 36px",
        }}>
          <div style={{ border: "1px solid rgba(201, 168, 76, 0.08)", borderRadius: 6, padding: "16px 12px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: "0.2em", color: "#c9a84c", opacity: 0.7, marginBottom: 10 }}>
              RESEARCH
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, lineHeight: 1.7, color: "#4a4539" }}>
              Drop a CA — get security, bonding curve, price, holders. Drop a wallet — get trade patterns.
            </div>
          </div>
          <div style={{ border: "1px solid rgba(201, 168, 76, 0.08)", borderRadius: 6, padding: "16px 12px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: "0.2em", color: "#c9a84c", opacity: 0.7, marginBottom: 10 }}>
              TRADE
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, lineHeight: 1.7, color: "#4a4539" }}>
              Buy and sell on Four.Meme, Flap.sh, and PancakeSwap. Your wallet. Your keys. 5% slippage protection.
            </div>
          </div>
          <div style={{ border: "1px solid rgba(201, 168, 76, 0.08)", borderRadius: 6, padding: "16px 12px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: "0.2em", color: "#c9a84c", opacity: 0.7, marginBottom: 10 }}>
              TRACK
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, lineHeight: 1.7, color: "#4a4539" }}>
              Live portfolio with real-time PnL. Set alerts. Withdraw anytime.
            </div>
          </div>
        </div>

        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.25em",
          color: "#c9a84c", opacity: 0.4, marginBottom: 20,
        }}>
          HOLD 25,000 $FLAGENT TO ACTIVATE
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <a href={TELEGRAM_BOT} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: "0.15em",
            color: "#050503", background: "#c9a84c", padding: "10px 28px",
            borderRadius: 4, transition: "opacity 0.2s",
          }}>
            OPEN TELEGRAM BOT
          </a>
          <a href={PCS_BUY_URL} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.12em",
            color: "#5a5347", transition: "opacity 0.2s",
          }}>
            Buy $FLAGENT on PancakeSwap
          </a>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 18, fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.15em" }}>
          <a href={X_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            X
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            GITHUB
          </a>
          <a href="/how-it-works" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            HOW IT WORKS
          </a>
          <a href={walletUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            BSCSCAN
          </a>
          <a href={TELEGRAM_BOT} target="_blank" rel="noopener noreferrer" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            TELEGRAM BOT
          </a>
        </div>
        <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 7, letterSpacing: "0.3em", color: "#3a3530" }}>
          BSC · FOUR.MEME · FLAP.SH
        </div>
      </div>
    </div>
  );
}
