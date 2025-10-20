// src/app/me/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';

type Player = { id: string; name: string };
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  players: Player[];
  status: 'setup' | 'active' | 'completed';
};

function safeMe(): Player {
  try {
    const raw = localStorage.getItem('kava_me');
    if (raw) return JSON.parse(raw);
  } catch {}
  const me = { id: crypto.randomUUID(), name: 'Player' };
  try { localStorage.setItem('kava_me', JSON.stringify(me)); } catch {}
  return me;
}

export default function MyTournamentsPage() {
  const me = useMemo(safeMe, []);
  const [all, setAll] = useState<Tournament[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      // Very defensive: tolerate any response shape
      const res = await fetch('/api/tournaments', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data?.tournaments) ? data.tournaments
               : Array.isArray(data) ? data
               : [];
      const normalized: Tournament[] = arr.map((t: any) => ({
        id: String(t?.id ?? ''),
        name: String(t?.name ?? 'Untitled'),
        code: t?.code ? String(t.code) : undefined,
        hostId: String(t?.hostId ?? ''),
        status: (t?.status === 'active' || t?.status === 'completed') ? t.status : 'setup',
        players: Array.isArray(t?.players)
          ? t.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') }))
          : [],
      })).filter(t => t.id && t.hostId);
      setAll(normalized);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
      setAll([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const hosting = (all || []).filter(t => t.hostId === me.id);
  const playing = (all || []).filter(t => t.hostId !== me.id && t.players.some(p => p.id === me.id));

  return (
    <main style={wrap}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <BackButton href="/" />
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} style={btnGhost} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      <h1 style={{ margin:'6px 0 12px' }}>My tournaments</h1>

      {err && (
        <div style={errorBox}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Couldn’t load tournaments</div>
          <div style={{ opacity:.85, fontSize:13, marginBottom:8 }}>{err}</div>
          <div><button onClick={load} style={btn}>{busy ? 'Retrying…' : 'Try again'}</button></div>
        </div>
      )}

      <section style={card}>
        <h3 style={{ marginTop:0 }}>Hosting</h3>
        {hosting.length === 0 ? (
          <div style={{ opacity:.7 }}>You’re not hosting any tournaments yet.</div>
        ) : (
          <ul style={list}>
            {hosting.map(t => (
              <li key={t.id} style={row}>
                <div>
                  <div style={{ fontWeight:700 }}>{t.name}</div>
                  <div style={{ opacity:.7, fontSize:13 }}>
                    {t.code ? <>Code: <b>{t.code}</b> • </> : null}
                    {t.players.length} {t.players.length === 1 ? 'player' : 'players'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Link href={`/t/${encodeURIComponent(t.id)}`} style={btn}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <h3 style={{ marginTop:0 }}>Playing</h3>
        {playing.length === 0 ? (
          <div style={{ opacity:.7 }}>You’re not in any tournaments yet.</div>
        ) : (
          <ul style={list}>
            {playing.map(t => (
              <li key={t.id} style={row}>
                <div>
                  <div style={{ fontWeight:700 }}>{t.name}</div>
                  <div style={{ opacity:.7, fontSize:13 }}>
                    {t.code ? <>Code: <b>{t.code}</b> • </> : null}
                    {t.players.length} {t.players.length === 1 ? 'player' : 'players'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Link href={`/t/${encodeURIComponent(t.id)}`} style={btnGhost}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* styles (matching your app look) */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const list: React.CSSProperties = { listStyle:'none', padding:0, margin:0, display:'grid', gap:8 };
const row: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none', cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', textDecoration:'none', cursor:'pointer' };
const errorBox: React.CSSProperties = { background:'rgba(127,29,29,.25)', border:'1px solid rgba(248,113,113,.35)', borderRadius:12, padding:12, marginBottom:14 };
