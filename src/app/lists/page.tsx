// src/app/lists/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';
import AlertsToggle from '@/components/AlertsToggle';
import { uid } from '@/lib/storage';
import { startAdaptivePoll } from '@/lib/poll';

type Player = { id: string; name: string };
type Table = { a?: string; b?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string;
  status: "active"; createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};
type Payload = { hosting: ListGame[]; playing: ListGame[] };

export default function MyLists() {
  const [data, setData] = useState<Payload>({ hosting: [], playing: [] });
  const [error, setError] = useState<string | null>(null);

  const me = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Player' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  useEffect(() => {
    if (!me?.id) return;
    const url = `/api/lists?userId=${encodeURIComponent(me.id)}`;
    const poll = startAdaptivePoll<Payload>({
      key: `lists:${me.id}`,
      minMs: 4000,
      maxMs: 60000,
      fetchOnce: async (etag) => {
        const res = await fetch(url, {
          headers: etag ? { 'If-None-Match': etag } : undefined,
          cache: 'no-store',
        });
        if (res.status === 304) return { status: 304, etag: etag ?? null };
        if (!res.ok) {
          const text = await res.text().catch(()=>'');
          setError(`${res.status} ${text || res.statusText}`);
          return { status: 304, etag: etag ?? null };
        }
        const payload = await res.json();
        const newTag = res.headers.get('etag') || res.headers.get('x-l-version') || null;
        setError(null);
        return { status: 200, etag: newTag, payload };
      },
      onChange: (payload) => setData(payload),
    });
    return () => poll.stop();
  }, [me?.id]);

  return (
    <main style={{ minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <BackButton href="/" />
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 }}>Live</span>
          <AlertsToggle />
          <button
            style={{ padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 }}
            onClick={() => location.reload()}
          >Refresh</button>
        </div>
      </div>

      <h2 style={{ marginTop:16 }}>My lists</h2>

      {error && (
        <div style={{ background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:12, padding:12, margin:'8px 0 12px' }}>
          <b>Couldn’t load lists:</b> {error}
        </div>
      )}

      <section style={sectionCard}>
        <h3 style={{ margin:'0 0 8px' }}>Hosting</h3>
        {data.hosting.length === 0 ? (
          <div style={{ opacity:.75 }}>You’re not hosting any lists yet.</div>
        ) : (
          <ul style={listUl}>
            {data.hosting.map(l => (
              <li key={l.id} style={row}>
                <div>
                  <div style={{ fontWeight:700 }}>{l.name}</div>
                  <div style={{ opacity:.75, fontSize:13 }}>
                    Code: {l.code || '—'} • {l.players.length} {l.players.length === 1 ? 'player' : 'players'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <a href={`/list/${l.id}`} style={btnPrimary}>Open</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionCard}>
        <h3 style={{ margin:'0 0 8px' }}>Playing</h3>
        {data.playing.length === 0 ? (
          <div style={{ opacity:.75 }}>You’re not in any lists yet.</div>
        ) : (
          <ul style={listUl}>
            {data.playing.map(l => (
              <li key={l.id} style={row}>
                <div>
                  <div style={{ fontWeight:700 }}>{l.name}</div>
                  <div style={{ opacity:.75, fontSize:13 }}>
                    Code: {l.code || '—'} • {l.players.length} {l.players.length === 1 ? 'player' : 'players'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <a href={`/list/${l.id}`} style={btnGhost}>Open</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const sectionCard: React.CSSProperties = {
  background:'rgba(255,255,255,0.06)',
  border:'1px solid rgba(255,255,255,0.12)',
  borderRadius:14,
  padding:14,
  marginTop:12,
};
const listUl: React.CSSProperties = { listStyle:'none', padding:0, margin:0, display:'grid', gap:8 };
const row: React.CSSProperties = {
  display:'flex', justifyContent:'space-between', alignItems:'center',
  background:'#111', border:'1px solid rgba(255,255,255,.12)', borderRadius:10, padding:'10px 12px'
};
const btnPrimary: React.CSSProperties = { padding:'8px 12px', borderRadius:8, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none' };
const btnGhost: React.CSSProperties   = { padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.25)', background:'transparent', color:'#fff', textDecoration:'none' };
