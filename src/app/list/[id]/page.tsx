// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import {
  getListRemote, listJoin, listLeave, listILost, listSetTables,
  ListGame, Player, uid
} from '../../../lib/storage';

export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const pollRef = useRef<any>(null);

  const id = typeof window !== 'undefined'
    ? decodeURIComponent(window.location.pathname.split('/').pop() || '')
    : '';

  const me = useMemo<Player>(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null') || { id: uid(), name: 'Player' }; }
    catch { return { id: uid(), name: 'Player' }; }
  }, []);
  useEffect(() => { localStorage.setItem('kava_me', JSON.stringify(me)); }, [me]);

  async function loadOnce() { if (!id) return; const next = await getListRemote(id); setG(next); }
  useEffect(() => { loadOnce(); clearInterval(pollRef.current); pollRef.current = setInterval(loadOnce, 1000); return () => clearInterval(pollRef.current); }, [id]);

  const iAmHost = g && me?.id === g.hostId;

  async function onCopy(){ if (!g?.code) return; await navigator.clipboard.writeText(g.code); alert('Code copied!'); }

  async function onAddPlayerManual() {
    if (!g || busy) return;
    const nm = nameField.trim(); if (!nm) return;
    setBusy(true);
    try {
      const p: Player = { id: uid(), name: nm };
      const updated = await listJoin(g, p);   // queues + auto-seats
      setG({ ...updated });
      setNameField('');
    } catch { alert('Could not add player.'); }
    finally { setBusy(false); }
  }

  async function onAddMe() { if (!g || busy) return; setBusy(true); try { const updated = await listJoin(g, me); setG({ ...updated }); } catch { alert('Could not join.'); } finally { setBusy(false); } }
  async function onRemovePlayer(id: string){ if (!g || busy) return; setBusy(true); try { const updated = await listLeave(g, id); setG({ ...updated }); } catch { alert('Could not remove.'); } finally { setBusy(false); } }
  async function onJoinQueue(){ if (!g || busy) return; setBusy(true); try { const updated = await listJoin(g, me); setG({ ...updated }); } catch { alert('Could not join queue.'); } finally { setBusy(false); } }
  async function onLeaveQueue(){ if (!g || busy) return; setBusy(true); try { const updated = await listLeave(g, me.id); setG({ ...updated }); } catch { alert('Could not leave.'); } finally { setBusy(false); } }
  async function onILost(){ if (!g || busy) return; const idx = g.tables.findIndex(t=>t.a===me.id || t.b===me.id); if (idx<0) { alert('You are not seated right now.'); return; } setBusy(true); try { const updated = await listILost(g, idx, me.id); setG({ ...updated }); alert("It's ok — join again by pressing “Join queue”."); } catch { alert('Could not submit result.'); } finally { setBusy(false); } }
  async function onTables(count:1|2){ if (!g || busy) return; setBusy(true); try { const updated = await listSetTables(g,count); setG({ ...updated }); } catch { alert('Could not update tables.'); } finally { setBusy(false); } }

  if (!g) return (<main style={wrap}><BackButton href="/lists" /><p>Loading…</p></main>);

  const myTableIndex = g.tables.findIndex(t => t.a === me.id || t.b === me.id);
  const seated = myTableIndex >= 0;
  const queued = g.queue.includes(me.id);

  const oneActive = g.tables.length === 1;
  const twoActive = g.tables.length >= 2;

  return (
    <main style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/lists" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pill}>Live</span>
          <button style={btnGhostSm} onClick={()=>loadOnce()}>Refresh</button>
        </div>
      </div>

      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input defaultValue={g.name} onBlur={()=>{}} style={nameInput} disabled={busy}/>
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Private code: <b>{g.code || '—'}</b> {g.code && <button style={chipBtn} onClick={onCopy}>Copy</button>} • {g.players.length} {g.players.length===1?'player':'players'}
          </div>
        </div>

        <div style={{display:'flex',gap:8}}>
          {!seated && !queued && <button style={btn} onClick={onJoinQueue} disabled={busy}>Join queue</button>}
          {queued && <button style={btnGhost} onClick={onLeaveQueue} disabled={busy}>Leave queue</button>}
          {seated && <button style={btnGhost} onClick={onILost} disabled={busy}>I lost</button>}
        </div>
      </header>

      <section style={notice}>
        <b>How it works:</b> One shared queue feeds both tables. When someone taps
        <i> “I lost”</i>, the next person in the queue sits at whichever table frees up first.
      </section>

      {g.hostId === me.id && (
        <section style={card}>
          <h3 style={{marginTop:0}}>Host controls</h3>

          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
            <button style={oneActive ? btnActive : btn} onClick={()=>onTables(1)} disabled={busy}>1 Table</button>
            <button style={twoActive ? btnActive : btnGhost} onClick={()=>onTables(2)} disabled={busy}>2 Tables</button>
          </div>

          <div style={{display:'flex',gap:8,flexWrap:'wrap', marginBottom:12}}>
            <input placeholder="Add player name..." value={nameField} onChange={e=>setNameField(e.target.value)} style={input} disabled={busy}/>
            <button style={btn} onClick={onAddPlayerManual} disabled={busy || !nameField.trim()}>Add player</button>
            <button style={btnGhost} onClick={onAddMe} disabled={busy}>Add me</button>
          </div>

          <div>
            <h4 style={{margin:'6px 0'}}>Players ({g.players.length})</h4>
            {g.players.length === 0 ? (
              <div style={{opacity:.7}}>No players yet.</div>
            ) : (
              <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:8}}>
                {g.players.map(p => (
                  <li key={p.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10}}>
                    <span>{p.name}</span>
                    <button style={btnGhost} onClick={()=>onRemovePlayer(p.id)} disabled={busy}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section style={card}>
        <h3 style={{marginTop:0}}>Queue ({g.queue.length})</h3>
        {g.queue.length === 0 ? (
          <div style={{opacity:.7}}>No one in queue.</div>
        ) : (
          <ol style={{margin:0, paddingLeft:18}}>
            {g.queue.map((id) => {
              const name = g.players.find(p=>p.id===id)?.name || '??';
              return <li key={id} style={{margin:'6px 0'}}>{name}</li>;
            })}
          </ol>
        )}
      </section>

      <section style={card}>
        <h3 style={{marginTop:0}}>Tables</h3>
        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap:12}}>
          {g.tables.map((t, i) => {
            const a = g.players.find(p=>p.id===t.a)?.name || (t.a ? '??' : '—');
            const b = g.players.find(p=>p.id===t.b)?.name || (t.b ? '??' : '—');
            const meHere = t.a===me.id || t.b===me.id;
            return (
              <div key={i} style={{background:'#111',borderRadius:12,padding:'10px 12px',border:'1px solid rgba(255,255,255,.12)'}}>
                <div style={{opacity:.8,fontSize:12,marginBottom:6}}>Table {i+1}</div>
                <div style={{minHeight:22}}>{a} vs {b}</div>
                {meHere && <div style={{marginTop:8}}><button style={btnMini} onClick={onILost} disabled={busy}>I lost</button></div>}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const notice: React.CSSProperties = { background:'rgba(14,165,233,.12)', border:'1px solid rgba(14,165,233,.25)', borderRadius:12, padding:'10px 12px', margin:'8px 0 14px' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const pill: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnActive: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const chipBtn: React.CSSProperties = { padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const input: React.CSSProperties = { width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const nameInput: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
