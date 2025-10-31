// src/app/tournaments/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import BackButton from '../../components/BackButton';
import { uid } from '@/lib/storage';

type Row = { id: string; name: string; hostId: string; status: string; createdAt: number; };

export default function MyTournaments() {
  const me = useMemo(()=> {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null') || { id: uid(), name: 'Player' }; }
    catch { return { id: uid(), name: 'Player' }; }
  }, []);
  useEffect(()=>{ localStorage.setItem('kava_me', JSON.stringify(me)); }, [me]);

  const [hosting, setHosting] = useState<Row[]>([]);
  const [playing, setPlaying] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch(`/api/tournaments?userId=${encodeURIComponent(me.id)}&ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      setHosting(j.hosting || []);
      setPlaying(j.playing || []);
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2500); // fast enough for phone UX
    return () => clearInterval(t);
  }, [me.id]);

  return (
    <main style={{ minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' }}>
      <BackButton href="/" />
      <h1 style={{margin:'10px 0 14px'}}>My tournaments</h1>

      <section style={card}>
        <h3 style={{marginTop:0}}>Hosting ({hosting.length})</h3>
        {loading && hosting.length===0 ? <div style={{opacity:.7}}>Loading…</div> :
          hosting.length===0 ? <div style={{opacity:.7}}>You aren’t hosting any tournaments yet.</div> :
          <ul style={list}>
            {hosting.map(t=>(
              <li key={t.id}><a href={`/t/${encodeURIComponent(t.id)}`} style={link}>{t.name}</a></li>
            ))}
          </ul>}
      </section>

      <section style={card}>
        <h3 style={{marginTop:0}}>Playing ({playing.length})</h3>
        {loading && playing.length===0 ? <div style={{opacity:.7}}>Loading…</div> :
          playing.length===0 ? <div style={{opacity:.7}}>You aren’t in any tournaments yet.</div> :
          <ul style={list}>
            {playing.map(t=>(
              <li key={t.id}><a href={`/t/${encodeURIComponent(t.id)}`} style={link}>{t.name}</a></li>
            ))}
          </ul>}
      </section>
    </main>
  );
}

const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const list: React.CSSProperties = { listStyle:'none', margin:0, padding:0, display:'grid', gap:8 };
const link: React.CSSProperties = { color:'#fff', textDecoration:'none', border:'1px solid rgba(255,255,255,.25)', padding:'10px 12px', borderRadius:10, display:'block' };
