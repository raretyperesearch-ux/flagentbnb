"use client";
import { useState, useEffect, useRef } from "react";

var SB = "https://seartddspffufwiqzwvh.supabase.co";
var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYXJ0ZGRzcGZmdWZ3aXF6d3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzE5OTksImV4cCI6MjA4ODI0Nzk5OX0.0QtBuq9iMS0nuCsurfkatV22cse9nwRss_wLqsYsg_Y";
var HEADERS = { apikey: KEY, Authorization: "Bearer " + KEY };
var VIDEO_URL = "https://seartddspffufwiqzwvh.supabase.co/storage/v1/object/public/assets/flagent-bg.mp4";
var GITHUB_URL = "https://github.com/raretyperesearch-ux/flagentbnb";
var BSCSCAN_WALLET = "https://bscscan.com/address/0x6c8C4C62183B61E9dd0095e821B0F857b555b32d";
var TOKEN_URL = "https://flap.sh/bnb/0xbc443965124fb401fa814550e3f7ecb825527777";

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
  var _live = useState(false);
  var live = _live[0], setLive = _live[1];
  var _tick = useState(0);
  var setTick = _tick[1];
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
  }, []);

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
              // Keep last 14 lines — old ones stay, new ones push them up
              return p.concat(fresh).slice(-14);
            });
          }
        }).catch(function() {});
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
    }, 3000);
    return function() { clearInterval(poll); };
  }, []);

  useEffect(function() {
    var t = setInterval(function() { setTick(function(n) { return n + 1; }); }, 80);
    return function() { clearInterval(t); };
  }, []);

  // NO expire effect — lines stay on screen until new ones push them out

  function getStyle(line) {
    var age = Date.now() - line.born;
    var len = line.text.length;
    var tt = Math.min(len * 20, 800);
    // Typewriter phase
    if (age < tt) return { o: Math.min(age / 150, 1), c: Math.floor((age / tt) * len) };
    // Full brightness for 14 seconds
    if (age < 14000) return { o: 1, c: len };
    // Fade to dim (not invisible) over 6 seconds — settles at 0.25
    if (age < 20000) {
      var fade = 1 - (age - 14000) / 6000;
      return { o: Math.max(fade, 0.25), c: len };
    }
    // Stay dimmed — never disappear
    return { o: 0.25, c: len };
  }

  var walletUrl = stats.wallet
    ? "https://bscscan.com/address/" + stats.wallet
    : BSCSCAN_WALLET;

  return (
    <div style={{ height: "100dvh", background: "#050503", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{
        "@keyframes breathe{0%,100%{opacity:.25}50%{opacity:.85}}" +
        "@keyframes cursor{0%,100%{opacity:1}50%{opacity:0}}" +
        "a{text-decoration:none;color:inherit}" +
        "a:hover{opacity:0.6}"
      }</style>

      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          opacity: 0.25,
          filter: "grayscale(20%) brightness(0.8) contrast(1.1)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(180deg, #050503ee 0%, #05050350 25%, #05050318 50%, #05050350 75%, #050503ee 100%)" }}/>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 45%, #c9a84c0a 0%, transparent 55%)" }}/>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(90deg, #05050399 0%, transparent 30%, transparent 70%, #05050399 100%)" }}/>

      {/* HEADER */}
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
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#3a3530", display: "flex", justifyContent: "center", gap: 16 }}>
          <a href={walletUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4a4539", transition: "opacity 0.2s" }}>
            {stats.bal} BNB
          </a>
          <span style={{ color: "#5a7a4a" }}>{stats.pnl}</span>
          <span>{stats.pos} open</span>
        </div>
      </div>

      {/* COMMAND LINES */}
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

      {/* FOOTER */}
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, letterSpacing: "0.15em" }}>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            GITHUB
          </a>
          <a href="/how-it-works" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            HOW IT WORKS
          </a>
          <a href={walletUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#5a5347", transition: "opacity 0.2s" }}>
            BSCSCAN
          </a>
        </div>
        <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 7, letterSpacing: "0.3em", color: "#3a3530" }}>
          BSC · FOUR.MEME · FLAP.SH
        </div>
      </div>
    </div>
  );
}
