// src/app/lists/page.tsx
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
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true); setErr(null);
    try {
      const res = await listListsRemoteForUser(me.id);
      setHosting([...res.hosting].sort((a,b)=>b.createdAt-a.createdAt));
      setPlaying([...res.playing].sort((a,b)=>b.createdAt-a.createdAt));
    } catch (e:any) {
      setErr(e?.message || 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  }, [me?.id]);

  useEffect(() => {
    let stop = false;
    load();
    let t: any;
    if (live) t = setInterval(() => !stop && load(), 3000);
    return () => { stop = true; if (t) clearInterval(t); };
  }, [live, load]);

  async function deleteList(id: string) {
    if (!confirm('Delete this list and remove all players?')) return;
    const prev = hosting;
    setHosting(h => h.filter(x => x.id !== id));
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
                   Code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length===1?'player':'players'}
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
                   Code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length===1?'player':'players'}
                 </div>
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
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none', cursor:'pointer' };
const btnSm: React.CSSProperties = { ...btn, padding:'6px 10px', fontWeight:600 };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontWeight:600, cursor:'pointer' };
const btnDanger: React.CSSProperties = { padding:'8px 12px', borderRadius:10, background:'transparent', color:'#ff6b6b', border:'1px solid #ff6b6b', fontWeight:700, cursor:'pointer' };
const error: React.CSSProperties = { background:'#7f1d1d', border:'1px solid #b91c1c', padding:10, borderRadius:8 };
