'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';
import { startSmartPollETag } from '@/lib/poll';
import { uid } from '@/lib/storage';

type ListSummary = { id: string; name: string; createdAt: number; code?: string; hostId: string };

export default function ListsPage() {
  const me = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Player' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  const [hosting, setHosting] = useState<ListSummary[]>([]);
  const [playing, setPlaying] = useState<ListSummary[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!me?.id || paused) return;
    const stopper = startSmartPollETag<{ hosting: ListSummary[]; playing: ListSummary[] }>({
      url: `/api/lists?userId=${encodeURIComponent(me.id)}`,
      key: `lists:${me.id}`,
      versionHeader: 'x-lists-version',
      onUpdate: (p) => { setHosting(p.hosting || []); setPlaying(p.playing || []); },
    });
    return () => stopper.stop();
  }, [me?.id, paused]);

  async function deleteList(id: string) {
    if (!confirm('Delete this list?')) return;
    try {
      const res = await fetch(`/api/list/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      // Let the poll refresh; optimistically remove
      setHosting(h => h.filter(x => x.id !== id));
    } catch {
      alert('Could not delete the list.');
    }
  }

  return (
    <main style={{ minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <BackButton href="/" />
        <span style={{ padding:'6px 10px', borderRadius:999, background: paused ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.2)', border:'1px solid rgba(255,255,255,.2)' }}>
          {paused ? 'Paused' : 'Live'}
        </span>
        <button
          onClick={() => setPaused(p => !p)}
          style={{ padding:'8px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.25)', background:'transparent', color:'#fff', cursor:'pointer' }}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{ padding:'8px 12px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', cursor:'pointer', fontWeight:700 }}
        >
          Refresh
        </button>
      </div>

      <h1 style={{ margin:'14px 0' }}>My lists</h1>

      <section style={card}>
        <h3 style={{ marginTop:0 }}>Hosting</h3>
        {hosting.length === 0 ? (
          <div style={{ opacity:.7 }}>You’re not hosting any lists yet.</div>
        ) : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:10 }}>
            {hosting.map(l => (
              <li key={l.id} style={row}>
                <a href={`/list/${l.id}`} style={{ color:'#fff', textDecoration:'none' }}>{l.name}</a>
                <div style={{ display:'flex', gap:8 }}>
                  <a href={`/list/${l.id}`} style={btnSm}>Open</a>
                  <button onClick={() => deleteList(l.id)} style={btnGhostSm}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <h3 style={{ marginTop:0 }}>Playing</h3>
        {playing.length === 0 ? (
          <div style={{ opacity:.7 }}>You’re not in any lists yet.</div>
        ) : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:10 }}>
            {playing.map(l => (
              <li key={l.id} style={row}>
                <a href={`/list/${l.id}`} style={{ color:'#fff', textDecoration:'none' }}>{l.name}</a>
                <a href={`/list/${l.id}`} style={btnSm}>Open</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginTop:14 };
const row: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 };
const btnSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
