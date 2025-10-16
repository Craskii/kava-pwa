// src/app/lists/page.tsx
'use client';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ErrorBoundary from '../../components/ErrorBoundary';
import { uid, ListGame } from '../../lib/storage';
import { startSmartPoll } from '../../lib/poll';

/** Prevent platform overlay from replacing UI; still log stacks */
function useSwallowGlobalErrors() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => { console.error('Global error:', e.error ?? e.message); e.preventDefault(); };
    const onRej = (e: PromiseRejectionEvent) => { console.error('Unhandled rejection:', e.reason); e.preventDefault(); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
}

/** Normalize any server object into a safe ListGame */
function coerceListGame(x: any): ListGame {
  return {
    id: String(x?.id ?? ''),
    name: String(x?.name ?? 'Untitled'),
    code: x?.code ? String(x.code) : undefined,
    hostId: String(x?.hostId ?? ''),
    status: 'active',
    createdAt: Number(x?.createdAt ?? Date.now()),
    tables: Array.isArray(x?.tables) ? x.tables.map((t: any) => ({ a: t?.a, b: t?.b })) : [],
    players: Array.isArray(x?.players) ? x.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') })) : [],
    queue: Array.isArray(x?.queue) ? x.queue.map((id: any) => String(id)) : [],
    v: Number(x?.v ?? 0),
  };
}

export default function MyListsPage() {
  useSwallowGlobalErrors();

  // render only on client to avoid hydration mismatches
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // identity
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); }
    catch { return null; }
  }, []);

  useEffect(() => {
    if (!me) {
      const newMe = { id: uid(), name: 'Player' };
      localStorage.setItem('kava_me', JSON.stringify(newMe));
    }
  }, [me]);

  const [hosting, setHosting] = useState<ListGame[]>([]);
  const [playing, setPlaying] = useState<ListGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  async function fetchMine(userId: string) {
    const res = await fetch(`/api/lists?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    const v = res.headers.get('x-l-version') || '';
    const json = await res.json().catch(() => ({ hosting: [], playing: [] }));
    const hs: ListGame[] = (Array.isArray(json.hosting) ? json.hosting : []).map(coerceListGame);
    const ps: ListGame[] = (Array.isArray(json.playing) ? json.playing : []).map(coerceListGame);
    return { v, hosting: hs, playing: ps };
  }

  useEffect(() => {
    if (!me?.id) return;
    setLoading(true);
    setErr(null);

    pollRef.current?.stop();
    const poll = startSmartPoll(async () => {
      try {
        const { v, hosting, playing } = await fetchMine(me.id);
        const byCreated = (a: ListGame, b: ListGame) => (Number(b.createdAt)||0) - (Number(a.createdAt)||0);
        setHosting([...hosting].sort(byCreated));
        setPlaying([...playing].sort(byCreated));
        setLoading(false);
        return v;
      } catch (e: any) {
        console.error('lists fetch error:', e);
        setErr(e?.message || 'Failed to load lists');
        return null;
      }
    });

    pollRef.current = poll;
    return () => poll.stop();
  }, [me?.id]);

  useEffect(() => {
    if (!pollRef.current) return;
    if (live) pollRef.current.bump();
    else pollRef.current.stop();
  }, [live]);

  async function deleteList(id: string) {
    if (!confirm('Delete this list and remove all players?')) return;
    const prev = hosting;
    setHosting(h => h.filter(x => x.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/list/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`));
      try { window.dispatchEvent(new Event('alerts:bump')); } catch {}
    } catch (e:any) {
      alert(e?.message || 'Could not delete list.');
      setHosting(prev);
    }
  }

  return (
    <ErrorBoundary>
      <main style={wrap}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          {/* Replace BackButton with a simple link to avoid any subcomponent errors */}
          <a href="/" style={btnGhostSm}>&larr; Back</a>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={pill}>{live ? 'Live' : 'Paused'}</span>
            <button style={btnGhostSm} onClick={()=>setLive(v=>!v)}>{live ? 'Pause' : 'Go live'}</button>
            <button style={btnSm} onClick={()=>pollRef.current?.bump()}>Refresh</button>
          </div>
        </div>

        <h1 style={{ margin: '8px 0 12px' }}>My lists</h1>

        {err && <div style={error}>{err}</div>}

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Hosting</h3>
          {loading && hosting.length === 0 ? <div style={muted}>Loading…</div> :
           hosting.length === 0 ? <div style={muted}>You’re not hosting any lists yet.</div> :
           <ul style={list}>
             {hosting.map(g => (
               <li key={g.id} style={tileOuter}>
                 <div style={tileInner}>
                   <div style={{ fontWeight:700, marginBottom:4 }}>{g.name}</div>
                   <div style={{ opacity:.8, fontSize:12 }}>
                     Code: <b>{g.code || '—'}</b> • {(g.players?.length ?? 0)} {(g.players?.length ?? 0)===1?'player':'players'}
                   </div>
                 </div>
                 <div style={{display:'flex',gap:8}}>
                   <a href={`/list/${g.id}`} style={btn}>Open</a>
                   <button onClick={() => deleteList(g.id)} style={btnDanger}>Delete</button>
                 </div>
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
                   <div style={{ opacity:.8, fontSize:12 }}>
                     Code: <b>{g.code || '—'}</b> • {(g.players?.length ?? 0)} {(g.players?.length ?? 0)===1?'player':'players'}
                   </div>
                 </div>
                 <a href={`/list/${g.id}`} style={btn}>Open</a>
               </li>
             ))}
           </ul>}
        </section>
      </main>
    </ErrorBoundary>
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
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none', cursor:'pointer' };
const btnSm: React.CSSProperties = { ...btn, padding:'6px 10px', fontWeight:600 };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontWeight:600, cursor:'pointer' };
const btnDanger: React.CSSProperties = { padding:'8px 12px', borderRadius:10, background:'transparent', color:'#ff6b6b', border:'1px solid #ff6b6b', fontWeight:700, cursor:'pointer' };
