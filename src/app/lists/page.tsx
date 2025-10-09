'use client';
export const runtime = 'edge';

import BackButton from '../../components/BackButton';
import { useEffect, useMemo, useState } from 'react';
import { listListsRemoteForUser, uid, ListGame } from '../../lib/storage';

export default function MyListsPage() {
  const me = useMemo(() => { try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch { return null; } }, []);
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

  useEffect(() => {
    let stop = false;
    async function load() {
      if (!me?.id) return;
      setLoading(true);
      try {
        const res = await listListsRemoteForUser(me.id);
        if (!stop) {
          setHosting(res.hosting.sort((a,b)=>b.createdAt-a.createdAt));
          setPlaying(res.playing.sort((a,b)=>b.createdAt-a.createdAt));
        }
      } finally { if (!stop) setLoading(false); }
    }
    load();
    const t = setInterval(load, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [me?.id]);

  return (
    <main style={wrap}>
      <BackButton href="/" />
      <h1 style={{ margin: '8px 0 12px' }}>My lists</h1>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Hosting</h3>
        {loading && hosting.length === 0 ? <div style={muted}>Loading…</div> :
         hosting.length === 0 ? <div style={muted}>You’re not hosting any lists yet.</div> :
         <ul style={ul}>{hosting.map(g => (
           <li key={g.id} style={li}>
             <a href={`/list/${g.id}`} style={link}>{g.name}</a>
             <span style={mutedSmall}>{g.players.length} players</span>
           </li>
         ))}</ul>}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Playing</h3>
        {loading && playing.length === 0 ? <div style={muted}>Loading…</div> :
         playing.length === 0 ? <div style={muted}>You’re not in any lists yet.</div> :
         <ul style={ul}>{playing.map(g => (
           <li key={g.id} style={li}>
             <a href={`/list/${g.id}`} style={link}>{g.name}</a>
             <span style={mutedSmall}>{g.players.length} players</span>
           </li>
         ))}</ul>}
      </section>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const muted: React.CSSProperties = { opacity:.7 };
const mutedSmall: React.CSSProperties = { opacity:.7, fontSize:12 };
const ul: React.CSSProperties = { margin:0, padding:0, listStyle:'none', display:'grid', gap:8 };
const li: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', borderRadius:10, padding:'10px 12px' };
const link: React.CSSProperties = { color:'#fff', textDecoration:'none', fontWeight:700 };
