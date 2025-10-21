// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { startSmartPollETag } from '@/lib/poll';
import { uid } from '@/lib/storage';

/* Types (keep local to avoid coupling) */
type Table = { a?: string; b?: string; label: '8 foot' | '9 foot' };
type Player = { id: string; name: string };
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: 'active';
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue8: string[];
  queue9: string[];
};

/* coerce & helpers */
function coerceList(x: any): ListGame | null {
  if (!x) return null;
  try {
    const tables: Table[] = Array.isArray(x.tables)
      ? x.tables.map((t: any, i: number) => ({
          a: t?.a, b: t?.b,
          label: t?.label === '9 foot' || t?.label === '8 foot' ? t.label : (i === 1 ? '9 foot' : '8 foot')
        }))
      : [{ label: '8 foot' }, { label: '9 foot' }];
    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? 'Untitled'),
      code: x.code ? String(x.code) : undefined,
      hostId: String(x.hostId ?? ''),
      status: 'active',
      createdAt: Number(x.createdAt ?? Date.now()),
      tables,
      players: Array.isArray(x.players)
        ? x.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') }))
        : [],
      queue8: Array.isArray(x.queue8) ? x.queue8.map((id: any) => String(id)) : (Array.isArray(x.queue) ? x.queue.map((id: any) => String(id)) : []),
      queue9: Array.isArray(x.queue9) ? x.queue9.map((id: any) => String(id)) : [],
    };
  } catch { return null; }
}

/* save helper (no If-Match, server reconciles & versions) */
async function putList(doc: ListGame) {
  await fetch(`/api/list/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify(doc),
  });
}

export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');

  // id from URL
  const id =
    typeof window !== 'undefined'
      ? decodeURIComponent(window.location.pathname.split('/').pop() || '')
      : '';

  const me = useMemo<Player>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('kava_me') || 'null') || {
          id: uid(),
          name: 'Player',
        }
      );
    } catch {
      return { id: uid(), name: 'Player' };
    }
  }, []);
  useEffect(() => { localStorage.setItem('kava_me', JSON.stringify(me)); }, [me]);

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

  // seat-change alert
  const lastSeating = useRef<string>('');
  function detectMySeatingChanged(next: ListGame | null) {
    if (!next) return false;
    const tables = Array.isArray(next.tables) ? next.tables : [];
    const i = tables.findIndex((t) => t.a === me.id || t.b === me.id);
    if (i < 0) {
      if (lastSeating.current !== '') { lastSeating.current = ''; return true; }
      return false;
    }
    const a = tables[i]?.a ?? 'x', b = tables[i]?.b ?? 'x';
    const key = `table-${i}-${a}-${b}`;
    if (key !== lastSeating.current) { lastSeating.current = key; return true; }
    return false;
  }

  // polling
  useEffect(() => {
    if (!id) return;
    const stopper = startSmartPollETag<ListGame>({
      url: `/api/list/${encodeURIComponent(id)}`,
      key: `l:${id}`,
      versionHeader: 'x-l-version',
      onUpdate: (payload) => {
        const doc = coerceList(payload);
        if (!doc || !doc.id || !doc.hostId) return;
        setG(doc);
        if (detectMySeatingChanged(doc)) bumpAlerts();
      }
    });
    return () => stopper.stop();
  }, [id]);

  if (!g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <p style={{ opacity: 0.7 }}>Loading…</p>
      </main>
    );
  }

  const safePlayers = g.players;
  const q8 = g.queue8;
  const q9 = g.queue9;

  const myTableIndex = g.tables.findIndex(t => t.a === me.id || t.b === me.id);
  const seated = myTableIndex >= 0;
  const queued8 = q8.includes(me.id);
  const queued9 = q9.includes(me.id);
  const iAmHost = me.id === g.hostId;

  /* actions */
  async function renameList(newName: string) {
    if (!newName.trim()) return;
    const next = { ...g, name: newName.trim() };
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }
  async function renamePlayer(pid: string) {
    const cur = safePlayers.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    const next = { ...g, players: g.players.map(p => p.id === pid ? { ...p, name: nm.trim() || p.name } : p) };
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }
  async function addPlayerManual() {
    const nm = nameField.trim(); if (!nm) return;
    setNameField(''); const p: Player = { id: uid(), name: nm };
    const next = { ...g, players: [...g.players, p] };
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }
  async function removePlayer(pid: string) {
    const next: ListGame = {
      ...g,
      players: g.players.filter(p => p.id !== pid),
      queue8: g.queue8.filter(x => x !== pid),
      queue9: g.queue9.filter(x => x !== pid),
      tables: g.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b })),
    };
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }

  async function joinQueue(which: '8'|'9') {
    const field = which === '9' ? 'queue9' : 'queue8';
    if ((g as any)[field].includes(me.id)) return;
    const next: ListGame = { ...g, [field]: [...(g as any)[field], me.id] } as any;
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }
  async function leaveQueues() {
    const next: ListGame = { ...g, queue8: g.queue8.filter(x => x !== me.id), queue9: g.queue9.filter(x => x !== me.id) };
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }

  async function iLost() {
    const idx = g.tables.findIndex(t => t.a === me.id || t.b === me.id);
    if (idx < 0) return alert('You are not seated right now.');
    const t0 = g.tables[idx];
    const nextTables = g.tables.map((t,i) => i === idx
      ? { ...t, a: t.a === me.id ? undefined : t.a, b: t.b === me.id ? undefined : t.b }
      : t
    );
    // optionally auto rejoin their table queue
    const field = t0.label === '9 foot' ? 'queue9' : 'queue8';
    const next = { ...g, tables: nextTables, [field]: [...(g as any)[field], me.id] } as any;
    setG(next); setBusy(true);
    try { await putList(next); bumpAlerts(); } finally { setBusy(false); }
  }

  // drag & drop "bubble"
  type DragInfo =
    | { type: 'seat'; table: number; side: 'a'|'b'; pid?: string }
    | { type: 'q8'; index: number; pid: string }
    | { type: 'q9'; index: number; pid: string };

  function draggablePill(pid: string | undefined, info: DragInfo, title?: string) {
    const name = pid ? (safePlayers.find(p => p.id === pid)?.name || '??') : '—';
    const isDraggable = !!pid && iAmHost;
    return (
      <span
        draggable={isDraggable}
        onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify(info)); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, info)}
        style={{ ...pill, opacity: pid ? 1 : .6, cursor: isDraggable ? 'grab' : 'default' }}
        title={title}
      >
        {name}
      </span>
    );
  }

  function parseInfo(ev: React.DragEvent): DragInfo | null {
    try { return JSON.parse(ev.dataTransfer.getData('application/json')); } catch { return null; }
  }

  async function handleDrop(ev: React.DragEvent, target: DragInfo) {
    ev.preventDefault();
    const src = parseInfo(ev);
    if (!src) return;

    const next: ListGame = JSON.parse(JSON.stringify(g));

    function clearSeat(ti: number, side: 'a'|'b') {
      const pid = next.tables[ti][side];
      if (!pid) return;
      next.tables[ti][side] = undefined;
    }
    function placeSeat(ti: number, side: 'a'|'b', pid?: string) {
      if (!pid) return;
      // remove from both queues before seating
      next.queue8 = next.queue8.filter(x => x !== pid);
      next.queue9 = next.queue9.filter(x => x !== pid);
      // remove from other seat if was seated elsewhere
      next.tables = next.tables.map((t, i) => i === ti ? t : ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b }));
      next.tables[ti][side] = pid;
    }
    function moveWithinQueue(which: '8'|'9', from: number, to: number) {
      const arr = which === '9' ? next.queue9 : next.queue8;
      const [p] = arr.splice(from, 1);
      arr.splice(Math.max(0, Math.min(arr.length, to)), 0, p);
    }

    // handle all combinations
    if (target.type === 'seat') {
      // drop anything onto a seat (seat->seat, queue->seat)
      if (src.type === 'seat') {
        const spid = next.tables[src.table][src.side];
        const tpid = next.tables[target.table][target.side];
        next.tables[src.table][src.side] = tpid;
        next.tables[target.table][target.side] = spid;
      } else if (src.type === 'q8' || src.type === 'q9') {
        const pid = src.pid;
        // remove from its queue
        if (src.type === 'q8') next.queue8 = next.queue8.filter(x => x !== pid);
        if (src.type === 'q9') next.queue9 = next.queue9.filter(x => x !== pid);
        // place into seat
        placeSeat(target.table, target.side, pid);
      }
    } else if (target.type === 'q8') {
      if (src.type === 'q8') {
        moveWithinQueue('8', src.index, target.index);
      } else if (src.type === 'q9') {
        // move from q9 to q8
        next.queue9 = next.queue9.filter(x => x !== src.pid);
        next.queue8.splice(target.index, 0, src.pid);
      } else if (src.type === 'seat') {
        const pid = next.tables[src.table][src.side];
        clearSeat(src.table, src.side);
        if (pid) next.queue8.splice(target.index, 0, pid);
      }
    } else if (target.type === 'q9') {
      if (src.type === 'q9') {
        moveWithinQueue('9', src.index, target.index);
      } else if (src.type === 'q8') {
        next.queue8 = next.queue8.filter(x => x !== src.pid);
        next.queue9.splice(target.index, 0, src.pid);
      } else if (src.type === 'seat') {
        const pid = next.tables[src.table][src.side];
        clearSeat(src.table, src.side);
        if (pid) next.queue9.splice(target.index, 0, pid);
      }
    }

    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }

  function playerRow(p: Player) {
    return (
      <li
        key={p.id}
        style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}
      >
        <span>{p.name}</span>
        <div style={{ display:'flex', gap:8 }}>
          <button style={btnMini} onClick={() => renamePlayer(p.id)} disabled={busy}>Rename</button>
          <button style={btnMini} onClick={() => quickSend(p.id, '8')} disabled={busy}>Send to 8-ft</button>
          <button style={btnMini} onClick={() => quickSend(p.id, '9')} disabled={busy}>Send to 9-ft</button>
          <button style={btnGhost} onClick={() => removePlayer(p.id)} disabled={busy}>Remove</button>
        </div>
      </li>
    );
  }

  async function quickSend(pid: string, which: '8'|'9') {
    const f = which === '9' ? 'queue9' : 'queue8';
    const next: ListGame = {
      ...g,
      tables: g.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b })),
      queue8: g.queue8.filter(x => x !== pid),
      queue9: g.queue9.filter(x => x !== pid),
      [f]: [...(g as any)[f], pid],
    } as any;
    setG(next); setBusy(true);
    try { await putList(next); } finally { setBusy(false); }
  }

  return (
    <main style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/lists" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={() => location.reload()}>Refresh</button>
        </div>
      </div>

      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input
              defaultValue={g.name}
              onBlur={(e) => renameList(e.target.value)}
              style={nameInput}
              disabled={busy}
            />
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Private code: <b>{g.code || '—'}</b>
          </div>
        </div>

        <div style={{display:'flex',gap:8}}>
          {!seated && (
            <>
              <button style={btn} onClick={() => joinQueue('8')} disabled={busy || queued8}>Join 8-ft</button>
              <button style={btn} onClick={() => joinQueue('9')} disabled={busy || queued9}>Join 9-ft</button>
            </>
          )}
          {(queued8 || queued9) && <button style={btnGhost} onClick={leaveQueues} disabled={busy}>Leave queues</button>}
          {seated && <button style={btnGhost} onClick={iLost} disabled={busy}>I lost</button>}
        </div>
      </header>

      {/* Host controls */}
      {iAmHost && (
        <section style={card}>
          <h3 style={{marginTop:0}}>Host controls</h3>
          <div style={{display:'flex',gap:8,flexWrap:'wrap', marginBottom:12}}>
            <input
              placeholder="Add player name..."
              value={nameField}
              onChange={(e) => setNameField(e.target.value)}
              style={input}
              disabled={busy}
            />
            <button style={btn} onClick={addPlayerManual} disabled={busy || !nameField.trim()}>Add player</button>
            <button style={btnGhost} onClick={() => quickSend(me.id, '8')} disabled={busy}>Add me 8-ft</button>
            <button style={btnGhost} onClick={() => quickSend(me.id, '9')} disabled={busy}>Add me 9-ft</button>
          </div>
        </section>
      )}

      {/* Tables at the top */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Tables</h3>
        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap:12}}>
          {g.tables.map((t, i) => {
            const aName = safePlayers.find(p=>p.id===t.a)?.name || (t.a ? '??' : '—');
            const bName = safePlayers.find(p=>p.id===t.b)?.name || (t.b ? '??' : '—');
            const meHere = t.a===me.id || t.b===me.id;
            return (
              <div key={i} style={{background:'#111',borderRadius:12,padding:'10px 12px',border:'1px solid rgba(255,255,255,.12)'}}>
                <div style={{ opacity:.8, fontSize:12, marginBottom:6 }}>{t.label} — Table {i+1}</div>
                <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                  {draggablePill(t.a, { type:'seat', table:i, side:'a', pid:t.a })}
                  <span style={{ opacity:.7 }}>vs</span>
                  {draggablePill(t.b, { type:'seat', table:i, side:'b', pid:t.b })}
                </div>
                {meHere && (
                  <div style={{ marginTop: 8 }}>
                    <button style={btnMini} onClick={iLost} disabled={busy}>I lost</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Queues */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queues</h3>
        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap:12}}>
          <div>
            <div style={{ opacity:.85, marginBottom:6 }}>8-foot queue ({q8.length})</div>
            <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
              {q8.map((pid, idx) => (
                <li key={pid} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, { type:'q8', index: idx, pid })}>
                  {draggablePill(pid, { type:'q8', index: idx, pid }, 'Drag to reorder/move')}
                </li>
              ))}
              {/* drop to end area */}
              <li onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, { type:'q8', index: q8.length, pid: '__end' as any })} style={{ minHeight: 6 }} />
            </ul>
          </div>
          <div>
            <div style={{ opacity:.85, marginBottom:6 }}>9-foot queue ({q9.length})</div>
            <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
              {q9.map((pid, idx) => (
                <li key={pid} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, { type:'q9', index: idx, pid })}>
                  {draggablePill(pid, { type:'q9', index: idx, pid }, 'Drag to reorder/move')}
                </li>
              ))}
              <li onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, { type:'q9', index: q9.length, pid: '__end' as any })} style={{ minHeight: 6 }} />
            </ul>
          </div>
        </div>
      </section>

      {/* Players list with buttons */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Players ({safePlayers.length})</h3>
        {safePlayers.length === 0 ? (
          <div style={{ opacity:.7 }}>No players yet.</div>
        ) : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {safePlayers.map(playerRow)}
          </ul>
        )}
      </section>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const pill: React.CSSProperties = { padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', minWidth:40, textAlign:'center' };
const pillBadge: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const input: React.CSSProperties = { width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const nameInput: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
