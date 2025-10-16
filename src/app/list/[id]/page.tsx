// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import {
  getListRemote, listJoin, listLeave, listILost, listSetTables,
  ListGame, Player, uid
} from '../../../lib/storage';
import { startSmartPoll } from '../../../lib/poll';

/* ---------- small helpers ---------- */
function coerceList(x: any): ListGame | null {
  if (!x) return null;
  try {
    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? 'Untitled'),
      code: x.code ? String(x.code) : undefined,
      hostId: String(x.hostId ?? ''),
      status: 'active',
      createdAt: Number(x.createdAt ?? Date.now()),
      tables: Array.isArray(x.tables) ? x.tables.map((t: any) => ({ a: t?.a, b: t?.b })) : [],
      players: Array.isArray(x.players) ? x.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') })) : [],
      queue: Array.isArray(x.queue) ? x.queue.map((id: any) => String(id)) : [],
      v: Number(x.v ?? 0),
    };
  } catch { return null; }
}

export default function ListLobby() {
  const { id } = useParams<{ id: string }>();

  // Always call hooks: no early returns
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // identity
  const me = useMemo<Player>(() => {
    try {
      if (typeof window === 'undefined') return { id: uid(), name: 'Player' };
      return JSON.parse(localStorage.getItem('kava_me') || 'null') || { id: uid(), name: 'Player' };
    } catch { return { id: uid(), name: 'Player' }; }
  }, []);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('kava_me', JSON.stringify(me)); }, [me]);

  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // 🔔 alerts on this list
  useQueueAlerts({
    listId: id,
    upNextMessage: 'your up next get ready!!',
    matchReadyMessage: (s: any) => {
      const raw = s?.tableNumber ?? s?.table?.number ?? null;
      const n = Number(raw);
      const shown = Number.isFinite(n) ? (n === 0 || n === 1 ? n + 1 : n) : null;
      return shown ? `Your in table (#${shown})` : 'Your in table';
    },
  });

  /* ---- detect seat change to bump alerts ---- */
  const lastSeating = useRef<string>('');
  function detectMySeatingChanged(next: ListGame | null) {
    if (!next) return false;
    const i = next.tables.findIndex(t => t.a === me.id || t.b === me.id);
    if (i < 0) {
      if (lastSeating.current !== '') { lastSeating.current = ''; return true; }
      return false;
    }
    const a = next.tables[i].a ?? 'x';
    const b = next.tables[i].b ?? 'x';
    const key = `table-${i}-${a}-${b}`;
    if (key !== lastSeating.current) { lastSeating.current = key; return true; }
    return false;
  }

  /* ---- initial fetch ---- */
  async function loadOnce() {
    try {
      const next = await getListRemote(String(id));
      const coerced = coerceList(next);
      setG(coerced);
      if (detectMySeatingChanged(coerced)) bumpAlerts();
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load list');
    }
  }

  /* ---- Live updates: SSE with safe fallback to smart poll ---- */
  useEffect(() => {
    if (!id) return;
    let es: EventSource | null = null;
    let pollRef: { stop: () => void; bump: () => void } | null = null;

    const startPoll = () => {
      if (pollRef) return;
      pollRef = startSmartPoll(async () => {
        try {
          const next = await getListRemote(String(id));
          const coerced = coerceList(next);
          setG(coerced);
          if (detectMySeatingChanged(coerced)) bumpAlerts();
          setErr(null);
          return coerced?.v ?? null;
        } catch (e: any) {
          setErr(e?.message || 'Failed to poll list');
          return null;
        }
      });
    };

    const stopPoll = () => { pollRef?.stop(); pollRef = null; };

    (async () => {
      await loadOnce(); // prime

      try {
        es = new EventSource(`/api/list/${encodeURIComponent(String(id))}/stream`);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data?._deleted) { setG(null); setErr('This list was deleted.'); return; }
            // tolerate either {type:'snapshot', list: {...}} or the raw list
            const doc = coerceList(data?.list ?? data?.game ?? data);
            if (doc) { setG(doc); setErr(null); if (detectMySeatingChanged(doc)) bumpAlerts(); }
          } catch {
            // ignore malformed frames
          }
        };
        es.onerror = () => { /* fallback to poll */ startPoll(); };
      } catch {
        startPoll();
      }
    })();

    return () => {
      try { es?.close(); } catch {}
      stopPoll();
    };
  }, [id]);

  const iAmHost = g && me?.id === g.hostId;

  async function onCopy(){ if (!g?.code) return; await navigator.clipboard.writeText(g.code); alert('Code copied!'); }

  async function onAddPlayerManual() {
    if (!g || busy) return;
    const nm = nameField.trim(); if (!nm) return;
    setBusy(true);
    try {
      const p: Player = { id: uid(), name: nm };
      const updated = await listJoin(g, p);
      const coerced = coerceList(updated);
      setG(coerced);
      bumpAlerts();
    } catch { alert('Could not add player.'); }
    finally { setBusy(false); setNameField(''); }
  }

  async function onAddMe() {
    if (!g || busy) return;
    setBusy(true);
    try {
      const updated = await listJoin(g, me);
      setG(coerceList(updated));
      bumpAlerts();
    } catch { alert('Could not join.'); }
    finally { setBusy(false); }
  }

  async function onRemovePlayer(pid: string){
    if (!g || busy) return;
    setBusy(true);
    try {
      const updated = await listLeave(g, pid);
      setG(coerceList(updated));
      bumpAlerts();
    } catch { alert('Could not remove.'); }
    finally { setBusy(false); }
  }

  async function onJoinQueue(){
    if (!g || busy) return;
    setBusy(true);
    try {
      const updated = await listJoin(g, me);
      setG(coerceList(updated));
      bumpAlerts();
    } catch { alert('Could not join queue.'); }
    finally { setBusy(false); }
  }

  async function onLeaveQueue(){
    if (!g || busy) return;
    setBusy(true);
    try {
      const updated = await listLeave(g, me.id);
      setG(coerceList(updated));
      bumpAlerts();
    } catch { alert('Could not leave.'); }
    finally { setBusy(false); }
  }

  async function onILost(){
    if (!g || busy) return;
    const idx = g.tables.findIndex(t=>t.a===me.id || t.b===me.id);
    if (idx<0) { alert('You are not seated right now.'); return; }
    setBusy(true);
    try {
      const updated = await listILost(g, idx, me.id);
      setG(coerceList(updated));
      alert("It's ok — join again by pressing “Join queue”.");
      bumpAlerts();
    } catch { alert('Could not submit result.'); }
    finally { setBusy(false); }
  }

  async function onTables(count:1|2){
    if (!g || busy) return;
    setBusy(true);
    try {
      const updated = await listSetTables(g,count);
      setG(coerceList(updated));
      bumpAlerts();
    } catch { alert('Could not update tables.'); }
    finally { setBusy(false); }
  }

  // ----- UI -----
  if (!mounted) return (<main style={wrap}><BackButton href="/lists" /><p style={muted}>Loading…</p></main>);
  if (err && !g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <div style={errorBox}>
          <div style={{fontWeight:700}}>Couldn’t load this list.</div>
          <div style={{opacity:.85, fontSize:12, marginTop:6}}>{err}</div>
          <div style={{display:'flex', gap:8, marginTop:10}}>
            <button style={btn} onClick={loadOnce}>Retry</button>
            <a href="/lists" style={btnGhost}>Back to My lists</a>
          </div>
        </div>
      </main>
    );
  }

  if (!g) return (<main style={wrap}><BackButton href="/lists" /><p style={muted}>Loading…</p></main>);

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
          <AlertsToggle />
          <button style={btnGhostSm} onClick={loadOnce}>Refresh</button>
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
            {g.queue.map((qid) => {
              const name = g.players.find(p=>p.id===qid)?.name || '??';
              return <li key={qid} style={{margin:'6px 0'}}>{name}</li>;
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
const errorBox: React.CSSProperties = { background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:12, padding:16, marginTop:14 };
const muted: React.CSSProperties = { opacity:.7 }; // ✅ added
