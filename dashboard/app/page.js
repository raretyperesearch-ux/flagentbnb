"use client";
import { useState, useEffect } from "react";

var SB = "https://seartddspffufwiqzwvh.supabase.co";
var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYXJ0ZGRzcGZmdWZ3aXF6d3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzE5OTksImV4cCI6MjA4ODI0Nzk5OX0.0QtBuq9iMS0nuCsurfkatV22cse9nwRss_wLqsYsg_Y";
var HEADERS = { apikey: KEY, Authorization: "Bearer " + KEY };
var VIDEO_URL = "https://seartddspffufwiqzwvh.supabase.co/storage/v1/object/public/assets/flagent-bg.mp4";

var COL = { system:"#3a3530", detect:"#c9a84c", thought:"#6b6255", action:"#c9a84c", confirm:"#7a9a5a", monitor:"#4a4539", reject:"#6a4a3a" };
var MOCK = [
  { text:"flagent online", type:"system" },
  { text:"the markets are open. watching.", type:"thought" },
  { text:"scanning four.meme...", type:"system" },
  { text:"scanning flap.sh...", type:"system" },
];

export default function Home() {
  var _lines = useState([]);
  var lines = _lines[0], setLines = _lines[1];
  var _stats = useState({ bal:"—", pnl:"—", pos:0 });
  var stats = _stats[0], setStats = _stats[1];
  var _live = useState(false);
  var live = _live[0], setLive = _live[1];
  var _tick = useState(0);
  var setTick = _tick[1];

  // Initial load
  useEffect(function() {
    fetch(SB + "/rest/v1/feed?order=created_at.desc&limit=15", { headers: HEADERS })
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
          });
        }
      }).catch(function() {});
  }, []);

  // Poll for new feed + status
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
              return fresh.length ? p.concat(fresh).slice(-14) : p;
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
            });
          }
        }).catch(function() {});
    }, 3000);
    return function() { clearInterval(poll); };
  }, []);

  // Render tick
  useEffect(function() {
    var t = setInterval(function() { setTick(function(n) { return n + 1; }); }, 80);
    return function() { clearInterval(t); };
  }, []);

  // Expire old lines
  useEffect(function() {
    setLines(function(p) { return p.filter(function(l) { return Date.now() - l.born < 20000; }); });
  });

  function getStyle(line) {
    var age = Date.now() - line.born;
    var len = line.text.length;
    var tt = Math.min(len * 20, 800);
    if (age < tt) return { o: Math.min(age / 150, 1), c: Math.floor((age / tt) * len) };
    if (age < 14000) return { o: 1, c: len };
    if (age < 20000) return { o: 1 - (age - 14000) / 6000, c: len };
    return { o: 0, c: len };
  }

  return (
    <div style={{ height: "100dvh", background: "#050503", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{
        "@keyframes breathe{0%,100%{opacity:.25}50%{opacity:.85}}" +
        "@keyframes cursor{0%,100%{opacity:1}50%{opacity:0}}"
      }</style>

      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          opacity: 0.08,
          filter: "grayscale(40%) brightness(0.6) contrast(1.1)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      {/* GRADIENT OVERLAYS */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "linear-gradient(180deg, #050503 0%, #05050380 25%, #05050340 50%, #05050380 75%, #050503 100%)",
      }}/>
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 45%, #c9a84c05 0%, transparent 50%)",
      }}/>
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "linear-gradient(90deg, #050503cc 0%, transparent 25%, transparent 75%, #050503cc 100%)",
      }}/>

      {/* HEADER */}
      <div style={{ position: "relative", zIndex: 2, padding: "24px 20px 0", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 16, fontWeight: 700, letterSpacing: "0.22em", color: "#c9a84c", opacity: 0.7 }}>FLAGENT</span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: live ? "#7a9a5a" : "#6a4a3a", animation: "breathe 3s ease-in-out infinite" }}/>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#3a3530", display: "flex", justifyContent: "center", gap: 16 }}>
          <span>{stats.bal} BNB</span>
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
      <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 20px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 7, letterSpacing: "0.3em", color: "#1a1815" }}>
        BSC · FOUR.MEME · FLAP.SH
      </div>
    </div>
  );
}
