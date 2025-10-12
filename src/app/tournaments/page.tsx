// src/app/tournaments/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackButton from '../components/BackButton';

type Player = { id: string; name: string };
type Tournament = {
  id: string;
  hostId: string;
  name: string;
  status?: 'setup' | 'active' | 'completed';
  players?: Player[];
  createdAt?: number;
  updatedAt?: number;
  code?: string;
};

type ApiOk = { hosting: Tournament[]; playing: Tournament[]; listVersion: number };
type ApiErr = { error: string };

function getMe(): Player {
  try {
    const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
    if (saved?.id && saved?.name !== undefined) return saved;
  } catch {}
  const me = { id: crypto.randomUUID(), name: '' };
  localStorage.setItem('kava_me', JSON.stringify(me));
  return me;
}

export default function MyTournaments() {
  const me = useMemo(() => getMe(), []);
  const [hosting, setHosting] = useState<Tournament[] | null>(null);
  const [playing, setPlaying] = useState<Tournament[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setHosting(null);
    setPlaying(null);
    try {
      const res = await fetch(`/api/tournaments?userId=${encodeURIComponent(me.id)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ApiOk | ApiErr;
      if ('error' in data) throw new Error(data.error);
      setHosting(data.hosting);
      setPlaying(data.playing);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load tournaments.');
      setHosting([]);
      setPlaying([]);
    }
  }

  useEffect(() => { load(); }, []); // once on mount

  return (
    <main style={wrap}>
      <div style={{ marginBottom: 12 }}>
        <BackButton href="/" />
      </div>

      <h2 style={{ margin: '0 0 10px' }}>My tournaments</h2>

      {err && <div style={errorBox}>Couldn’t load tournaments. {err}</div>}

      <section style={card}>
        <div style={cardHead}>
          <b>Hosting</b>
          <span style={muted}>Live</span>
        </div>
        {hosting === null ? (
          <div style={muted}>Loading...</div>
        ) : hosting.length === 0 ? (
          <div style={muted}>You’re not hosting any tournaments yet.</div>
        ) : (
          <ul style={list}>
            {hosting.map(t => (
              <li key={t.id} style={row}>
                <Link href={`/t/${t.id}`} style={link}>
                  {t.name}
                </Link>
                <span style={pill}>{t.status || 'setup'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <div style={cardHead}><b>Playing</b></div>
        {playing === null ? (
          <div style={muted}>Loading...</div>
        ) : playing.length === 0 ? (
          <div style={muted}>You’re not in any tournaments yet.</div>
        ) : (
          <ul style={list}>
            {playing.map(t => (
              <li key={t.id} style={row}>
                <Link href={`/t/${t.id}`} style={link}>
                  {t.name}
                </Link>
                <span style={pill}>{t.status || 'setup'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', fontFamily:'system-ui', padding:16, display:'grid', gap:12 };
const errorBox: React.CSSProperties = { background:'rgba(255,80,80,.1)', border:'1px solid rgba(255,80,80,.35)', padding:'10px 12px', borderRadius:10, marginBottom:10 };
const card: React.CSSProperties = { background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:14, padding:12, display:'grid', gap:10 };
const cardHead: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center' };
const list: React.CSSProperties = { listStyle:'none', padding:0, margin:0, display:'grid', gap:8 };
const row: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'10px 12px', background:'#111', borderRadius:10 };
const link: React.CSSProperties = { color:'#fff', textDecoration:'none', fontWeight:700 };
const pill: React.CSSProperties = { fontSize:12, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.2)' };
const muted: React.CSSProperties = { opacity:.75, fontSize:13 };
