"use client";
import { useState, useEffect } from "react";

const SB = "https://seartddspffufwiqzwvh.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYXJ0ZGRzcGZmdWZ3aXF6d3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzE5OTksImV4cCI6MjA4ODI0Nzk5OX0.0QtBuq9iMS0nuCsurfkatV22cse9nwRss_wLqsYsg_Y";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const COL = { system:"#3a3530", detect:"#c9a84c", thought:"#6b6255", action:"#c9a84c", confirm:"#7a9a5a", monitor:"#4a4539", reject:"#6a4a3a" };
const MOCK = [
  { text:"flagent online", type:"system" },
  { text:"the markets are open. watching.", type:"thought" },
  { text:"scanning four.meme...", type:"system" },
  { text:"scanning flap.sh...", type:"system" },
];

export default function Home() {
  const [lines, setLines] = useState([]);
  const [stats, setStats] = useState({ bal:"—", pnl:"—", pos:0 });
  const [live, setLive] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    fetch(`${SB}/rest/v1/feed?order=created_at.desc&limit=15`, { headers: H })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setLines(d.reverse().map(x => ({ id:x.id, text:x.text, type:x.type, born:new Date(x.created_at).getTime() })));
          setLive(true);
        } else {
          setLines(MOCK.map((m,i) => ({ id:`m-${i}`, text:m.text, type:m.type, born:Date.now()-(MOCK.length-i)*3000 })));
        }
      }).catch(() => {});
    fetch(`${SB}/rest/v1/bot_status?id=eq.1`, { headers: H })
      .then(r => r.json())
      .then(d => { if(d?.[0]) setStats({ bal:d[0].wallet_balance_bnb?.toFixed(3)||"—", pnl:d[0].total_pnl_bnb!=null?(d[0].total_pnl_bnb>=0?"+":"")+d[0].total_pnl_bnb.toFixed(3):"—", pos:d[0].active_positions||0 }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      const since = new Date(Date.now()-5000).toISOString();
      fetch(`${SB}/rest/v1/feed?created_at=gte.${since}&order=created_at.asc&limit=5`, { headers: H })
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d) && d.length > 0) {
            setLive(true);
            setLines(p => { const ids=new Set(p.map(l=>l.id)); const fresh=d.filter(x=>!ids.has(x.id)).map(x=>({id:x.id,text:x.text,type:x.type,born:Date.now()})); return fresh.length?[...p,...fresh].slice(-14):p; });
          }
        }).catch(() => {});
      fetch(`${SB}/rest/v1/bot_status?id=eq.1`, { headers: H })
        .then(r => r.json())
        .then(d => { if(d?.[0]) setStats({ bal:d[0].wallet_balance_bnb?.toFixed(3)||"—", pnl:d[0].total_pnl_bnb!=null?(d[0].total_pnl_bnb>=0?"+":"")+d[0].total_pnl_bnb.toFixed(3):"—", pos:d[0].active_positions||0 }); })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => { const t=setInterval(()=>tick(n=>n+1),80); return ()=>clearInterval(t); }, []);
  useEffect(() => { setLines(p=>p.filter(l=>Date.now()-l.born<20000)); });

  const st = (l) => {
    const a=Date.now()-l.born, len=l.text.length, tt=Math.min(len*20,800);
    if(a<tt) return { o:Math.min(a/150,1), c:Math.floor((a/tt)*len) };
    if(a<14000) return { o:1, c:len };
    if(a<20000) return { o:1-(a-14000)/6000, c:len };
    return { o:0, c:len };
  };

  return (
    <div style={{ height:"100dvh", background:"#050503", position:"relative", overflow:"hidden", display:"flex", flexDirection:"column" }}>
      <style>{`
        @keyframes breathe{0%,100%{opacity:.25}50%{opacity:.85}}
        @keyframes cursor{0%,100%{opacity:1}50%{opacity:0}}
      `}</style>
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 50% 35%, #c9a84c04 0%, transparent 50%)" }}/>
      <div style={{ position:"relative", zIndex:2, padding:"24px 20px 0", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10 }}>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:16, fontWeight:700, letterSpacing:"0.22em", color:"#c9a84c", opacity:0.7 }}>FLAGENT</span>
          <span style={{ width:4, height:4, borderRadius:"50%", background:live?"#7a9a5a":"#6a4a3a", animation:"breathe 3s ease-in-out infinite" }}/>
        </div>
        <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"#3a3530", display:"flex", justifyContent:"center", gap:16 }}>
          <span>{stats.bal} BNB</span>
          <span style={{ color:"#5a7a4a" }}>{stats.pnl}</span>
          <span>{stats.pos} open</span>
        </div>
      </div>
      <div style={{ flex:1, position:"relative", zIndex:2, display:"flex", flexDirection:"column", justifyContent:"flex-end", alignItems:"center", padding:"0 16px 44px", maxWidth:540, margin:"0 auto", width:"100%" }}>
        {lines.map(l => {
          const { o, c } = st(l);
          const th = l.type === "thought";
          return (
            <div key={l.id} style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:th?12:11, fontStyle:th?"italic":"normal", lineHeight:2.2, color:COL[l.type]||"#3a3530", opacity:o, textAlign:"center", width:"100%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {l.text.slice(0,c)}
              {c<l.text.length && <span style={{ display:"inline-block", width:5, height:12, background:COL[l.type]||"#3a3530", marginLeft:1, verticalAlign:"middle", animation:"cursor 0.6s step-end infinite", opacity:0.7 }}/>}
            </div>
          );
        })}
      </div>
      <div style={{ position:"relative", zIndex:2, textAlign:"center", padding:"0 20px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:7, letterSpacing:"0.3em", color:"#1a1815" }}>
        BSC · FOUR.MEME · FLAP.SH
      </div>
    </div>
  );
}
