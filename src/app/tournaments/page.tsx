// src/app/tournaments/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import { getOrCreateMe } from '@/lib/me';

type Tournament = {
  id: string;
  hostId: string;
  name: string;
  code?: string;
  createdAt: number;
  players: { id: string; name: string }[];
};

export default function MyTournamentsPage() {
  const me = useMemo(() => getOrCreateMe('Player'), []);
  const [hosting, setHosting] = useState<Tournament[]>([]);
  const [playing, setPlaying] = useState<Tournament[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);

  const load = async () => {
    setErr(null); setLoading(true);
    try {
      const res = await fetch(`/api/tournaments?userId=${encodeURIComponent(me.id)}`, {
        cache: 'no-store',
        headers: { 'x-user-id': me.id }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHosting(Array.isArray(json?.hosting) ? json.hosting : []);
      setPlaying(Array.isArray(json?.playing) ? json.playing : []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (me?.id) load(); }, [me?.id]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [live, me?.id]);

  return (
    <main style={wrap}>
      <div style={container}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <BackButton href="/" />
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setLive(true)}  style={liveBtn(live)}>Live</button>
            <button onClick={()=>setLive(false)} style={liveBtn(!live)}>Pause</button>
            <button onClick={load} style={btnGhost}>Refresh</button>
          </div>
        </div>

        <h1 style={h1}>My tournaments</h1>
        {err && <div style={errBox}>{err}</div>}

        <section style={card}>
          <h3 style={{marginTop:0}}>Hosting</h3>
          {loading ? <div style={{opacity:.7}}>Loading…</div> :
            hosting.length === 0 ? <div style={{opacity:.7}}>You’re not hosting any tournaments yet.</div> :
            <ul style={list}>
              {hosting.map(t => (
                <li key={t.id} style={row}>
                  <div>
                    <div style={{fontWeight:600}}>{t.name}</div>
                    <div style={sub}>{t.code ? <>Private code: <b>{t.code}</b></> : 'Public'} • {t.players.length} players</div>
                  </div>
                  <Link href={`/t/${encodeURIComponent(t.id)}`} style={btn}>Open</Link>
                </li>
              ))}
            </ul>
          }
        </section>

        <section style={card}>
          <h3 style={{marginTop:0}}>Playing</h3>
          {loading ? <div style={{opacity:.7}}>Loading…</div> :
            playing.length === 0 ? <div style={{opacity:.7}}>You’re not in any tournaments yet.</div> :
            <ul style={list}>
              {playing.map(t => (
                <li key={t.id} style={row}>
                  <div>
                    <div style={{fontWeight:600}}>{t.name}</div>
                    <div style={sub}>{t.code ? <>Private code: <b>{t.code}</b></> : 'Public'} • {t.players.length} players</div>
                  </div>
                  <Link href={`/t/${encodeURIComponent(t.id)}`} style={btnGhost}>Open</Link>
                </li>
              ))}
            </ul>
          }
        </section>
      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', fontFamily:'system-ui', padding:24 };
const container: React.CSSProperties = { width:'100%', maxWidth:1000, margin:'0 auto', display:'grid', gap:14 };
const h1: React.CSSProperties = { margin:'8px 0 6px' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14 };
const list: React.CSSProperties = { listStyle:'none', padding:0, margin:0, display:'grid', gap:8 };
const row: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', background:'#111', borderRadius:10, padding:'10px 12px' };
const sub: React.CSSProperties = { opacity:.75, fontSize:13 };
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:8, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none' };
const btnGhost: React.CSSProperties = { padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', color:'#fff', textDecoration:'none' };
const errBox: React.CSSProperties = { background:'#3b0a0a', border:'1px solid #7f1d1d', padding:10, borderRadius:10 };
const liveBtn = (active:boolean):React.CSSProperties =>
  ({ padding:'8px 12px', borderRadius:8, border: active?'none':'1px solid #333', background: active?'#0ea5e9':'transparent', color:'#fff' });
