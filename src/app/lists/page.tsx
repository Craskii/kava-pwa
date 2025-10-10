'use client';
export const runtime = 'edge';

import BackButton from '../../components/BackButton';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listListsRemoteForUser, uid, ListGame } from '../../lib/storage';

export default function MyListsPage() {
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); }
    catch { return null; }
  }, []);

  useEffect(() => {
    if (!me) {
      const newMe = { id: uid(), name: 'Player' };
      localStorage.setItem('kava_me', JSON.stringify(newMe));
      location.reload();
    }
  }, [me]);

  const [hosting, setHosting] = useState<ListGame[]>([]);
  const [playing, setPlaying] = useState<ListGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);

  const load = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true);
    try {
      const res = await listListsRemoteForUser(me.id);
      setHosting(res.hosting.sort((a,b)=>b.createdAt-a.createdAt));
      setPlaying(res.playing.sort((a,b)=>b.createdAt-a.createdAt));
    } finally { setLoading(false); }
  }, [me?.id]);

  useEffect(() => {
    let stop = false;
    load();
    let t: any;
    if (live) t = setInterval(() => !stop && load(), 1000);
    return () => { stop = true; if (t) clearInterval(t); };
  }, [live, load]);

  return (
    <main style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pill}>{live ? 'Live' : 'Paused'}</span>
          <button style={btnGhostSm} onClick={()=>setLive(v=>!v)}>{live ? 'Pause' : 'Go live'}</button>
          <button style={btnSm} onClick={load}>Refresh</button>
        </div>
      </div>

      <h1 style={{ margin: '8px 0 12px' }}>My lists</h1>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Hosting</h3>
        {loading && hosting.length === 0 ? <div style={muted}>Loading…</div> :
         hosting.length === 0 ? <div style={muted}>You’re not hosting any lists yet.</div> :
         <ul style={list}>
           {hosting.map(g => (
             <li key={g.id} style={tileOuter}>
               <div style={tileInner}>
                 <div style={{ fontWeight:700, marginBottom:4 }}>{g.name}</div>
                 <div style={{ opacity:.8, fontSize:12 }}>Code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length===1?'player':'players'}</div>
               </div>
               <a href={`/list/${g.id}`} style={btn}>Open</a>
             </li>
           ))}
         </ul>}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Playing</h3>
        {loading && playing.length === 0 ? <div style={muted}>Loading…</div> :
         playing.length === 0 ? <div style={muted}>You’re not in any lists yet.</div> :
         <ul style={list}>
           {playing.map(g => (
             <li key={g.id} style={tileOuter}>
               <div style={tileInner}>
                 <div style={{ fontWeight:700, marginBottom:4 }}>{g.name}</div>
                 <div style={{ opacity:.8, fontSize:12 }}>Code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length===1?'player':'players'}</div>
               </div>
               <a href={`/list/${g.id}`} style={btn}>Open</a>
             </li>
           ))}
         </ul>}
      </section>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const muted: React.CSSProperties = { opacity:.7 };
const list: React.CSSProperties = { listStyle:'none', padding:0, margin:0, display:'grid', gap:10 };
const tileOuter: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px', background:'#111', borderRadius:12, border:'1px solid rgba(255,255,255,0.12)' };
const tileInner: React.CSSProperties = { minWidth:0 };
const pill: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none' };
const btnSm: React.CSSProperties = { ...btn, padding:'6px 10px', fontWeight:600 };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontWeight:600 };
