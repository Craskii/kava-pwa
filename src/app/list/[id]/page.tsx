// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { startSmartPollETag } from '@/lib/poll';
import { uid } from '@/lib/storage';

/* Types */
type TableLabel = '8 foot' | '9 foot';
type Table = { a?: string; b?: string; label: TableLabel };
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
  v?: number;
};

/* ---------- coerce & helpers ---------- */
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
      // migrate older single 'queue' to queue8 (kept for safety)
      queue8: Array.isArray(x.queue8) ? x.queue8.map((id: any) => String(id))
            : Array.isArray(x.queue) ? x.queue.map((id: any) => String(id)) : [],
      queue9: Array.isArray(x.queue9) ? x.queue9.map((id: any) => String(id)) : [],
      v: Number(x.v ?? 0),
    };
  } catch { return null; }
}

/* server PUT (server resolves versions) */
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
  const [showTableControls, setShowTableControls] = useState(false);
  const excludeSeatPidRef = useRef<string | null>(null); // prevent instant reseat after "Lost"

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

  /* ---------- computed ---------- */
  if (!g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <p style={{ opacity: 0.7 }}>Loading…</p>
      </main>
    );
  }

  const iAmHost = me.id === g.hostId;
  const myTableIndex = g.tables.findIndex(t => t.a === me.id || t.b === me.id);
  const seated = myTableIndex >= 0;
  const q8 = g.queue8;
  const q9 = g.queue9;
  const safePlayers = g.players;

  function nameOf(pid?: string) {
    if (!pid) return '—';
    return safePlayers.find(p => p.id === pid)?.name || '??';
  }

  /* ---------- auto-seat logic (table pulls from its matching queue) ---------- */
  function autoSeat(next: ListGame): ListGame {
    const has = (pid?: string) => !!pid && next.players.some(p => p.id === pid);
    const excluded = excludeSeatPidRef.current;

    const take = (arr: string[]) => {
      while (arr.length > 0) {
        const pid = arr[0];
        if (!has(pid)) { arr.shift(); continue; }
        if (excluded && pid === excluded) { arr.push(arr.shift()!); continue; }
        return arr.shift()!;
      }
      return undefined;
    };

    let changed = false;
    next.tables.forEach(t => {
      if (!t.a) {
        const pid = t.label === '8 foot' ? take(next.queue8) : take(next.queue9);
        if (pid) { t.a = pid; changed = true; }
      }
      if (!t.b) {
        const pid = t.label === '8 foot' ? take(next.queue8) : take(next.queue9);
        if (pid) { t.b = pid; changed = true; }
      }
    });

    // clear exclusion after pass
    excludeSeatPidRef.current = null;
    return changed ? next : next;
  }

  async function commit(mut: (draft: ListGame) => void) {
    const next: ListGame = JSON.parse(JSON.stringify(g));
    mut(next);
    autoSeat(next);
    setG(next); setBusy(true);
    try { await putList(next); if (detectMySeatingChanged(next)) bumpAlerts(); }
    finally { setBusy(false); }
  }

  /* ---------- actions ---------- */
  async function renameList(newName: string) {
    if (!newName.trim()) return;
    await commit(d => { d.name = newName.trim(); });
  }

  async function addPlayerManual() {
    const nm = nameField.trim(); if (!nm) return;
    setNameField('');
    const p: Player = { id: uid(), name: nm };
    await commit(d => { d.players.push(p); });
  }

  async function removePlayer(pid: string) {
    await commit(d => {
      d.players = d.players.filter(p => p.id !== pid);
      d.queue8 = d.queue8.filter(x => x !== pid);
      d.queue9 = d.queue9.filter(x => x !== pid);
      d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b }));
    });
  }

  async function renamePlayer(pid: string) {
    const cur = safePlayers.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    await commit(d => {
      const p = d.players.find(pp => pp.id === pid);
      if (p) p.name = nm.trim() || p.name;
    });
  }

  // Ensure "me" exists in players before queueing (fixes joining from phone)
  function ensureMe(d: ListGame) {
    if (!d.players.some(p => p.id === me.id)) d.players.push(me);
  }

  async function joinQueue(which: '8'|'9') {
    await commit(d => {
      ensureMe(d);
      const field = which === '9' ? 'queue9' : 'queue8';
      // remove me from both queues before adding
      d.queue8 = d.queue8.filter(x => x !== me.id);
      d.queue9 = d.queue9.filter(x => x !== me.id);
      (d as any)[field].push(me.id);
    });
  }

  async function leaveQueues() {
    await commit(d => {
      d.queue8 = d.queue8.filter(x => x !== me.id);
      d.queue9 = d.queue9.filter(x => x !== me.id);
    });
  }

  async function iLost(pid?: string) {
    const loser = pid ?? me.id;
    await commit(d => {
      const idx = d.tables.findIndex(tt => tt.a === loser || tt.b === loser);
      if (idx < 0) return;
      const t = d.tables[idx];
      if (t.a === loser) t.a = undefined;
      if (t.b === loser) t.b = undefined;

      // clean from queues then push to END of correct queue
      d.queue8 = d.queue8.filter(x => x !== loser);
      d.queue9 = d.queue9.filter(x => x !== loser);
      const field = t.label === '9 foot' ? 'queue9' : 'queue8';
      (d as any)[field].push(loser);

      // exclude this player in the immediate autoSeat pass
      excludeSeatPidRef.current = loser;
    });
  }

  /* ---------- drag & drop ---------- */
  type DragInfo =
    | { type: 'seat'; table: number; side: 'a'|'b'; pid?: string }
    | { type: 'q8'; index: number; pid: string }
    | { type: 'q9'; index: number; pid: string };

  function onDragStart(e: React.DragEvent, info: DragInfo) {
    e.dataTransfer.setData('application/json', JSON.stringify(info));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function parseInfo(ev: React.DragEvent): DragInfo | null {
    try { return JSON.parse(ev.dataTransfer.getData('application/json')); } catch { return null; }
  }

  async function handleDrop(ev: React.DragEvent, target: DragInfo) {
    ev.preventDefault();
    const src = parseInfo(ev);
    if (!src) return;

    await commit(d => {
      const moveWithin = (arr: string[], from: number, to: number) => {
        const safe = [...arr];
        const [p] = safe.splice(from, 1);
        safe.splice(Math.max(0, Math.min(safe.length, to)), 0, p);
        return safe;
      };
      const clearSeat = (ti: number, side: 'a'|'b') => { d.tables[ti][side] = undefined; };
      const removeEverywhere = (pid: string) => {
        d.queue8 = d.queue8.filter(x => x !== pid);
        d.queue9 = d.queue9.filter(x => x !== pid);
        d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b }));
      };
      const placeSeat = (ti: number, side: 'a'|'b', pid?: string) => {
        if (!pid) return;
        removeEverywhere(pid);
        d.tables[ti][side] = pid;
      };

      if (target.type === 'seat') {
        if (src.type === 'seat') {
          const sp = d.tables[src.table][src.side];
          const tp = d.tables[target.table][target.side];
          d.tables[src.table][src.side] = tp;
          d.tables[target.table][target.side] = sp;
        } else if (src.type === 'q8' || src.type === 'q9') {
          const pid = src.pid;
          if (src.type === 'q8') d.queue8 = d.queue8.filter(x => x !== pid);
          if (src.type === 'q9') d.queue9 = d.queue9.filter(x => x !== pid);
          placeSeat(target.table, target.side, pid);
        }
      } else if (target.type === 'q8') {
        if (src.type === 'q8') {
          d.queue8 = moveWithin(d.queue8, src.index, target.index);
        } else if (src.type === 'q9') {
          const pid = src.pid;
          d.queue9 = d.queue9.filter(x => x !== pid);
          d.queue8.splice(target.index, 0, pid);
        } else if (src.type === 'seat') {
          const pid = d.tables[src.table][src.side];
          clearSeat(src.table, src.side);
          if (pid) d.queue8.splice(target.index, 0, pid);
        }
      } else if (target.type === 'q9') {
        if (src.type === 'q9') {
          d.queue9 = moveWithin(d.queue9, src.index, target.index);
        } else if (src.type === 'q8') {
          const pid = src.pid;
          d.queue8 = d.queue8.filter(x => x !== pid);
          d.queue9.splice(target.index, 0, pid);
        } else if (src.type === 'seat') {
          const pid = d.tables[src.table][src.side];
          clearSeat(src.table, src.side);
          if (pid) d.queue9.splice(target.index, 0, pid);
        }
      }
    });
  }

  function pill(pid: string | undefined, info: DragInfo, title?: string) {
    const nm = nameOf(pid);
    const isDraggable = !!pid && iAmHost;
    return (
      <span
        draggable={isDraggable}
        onDragStart={(e)=>onDragStart(e, info)}
        onDragOver={onDragOver}
        onDrop={(e)=>handleDrop(e, info)}
        style={{ ...pillStyle, opacity: pid ? 1 : .6, cursor: isDraggable ? 'grab' : 'default' }}
        title={title}
      >
        {nm}
      </span>
    );
  }

  /* ---------- UI ---------- */
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

      {/* Name + code + quick join buttons */}
      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input
              defaultValue={g.name}
              onBlur={(e) => renameList(e.currentTarget.value)}
              style={nameInput}
              disabled={busy}
            />
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Private code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length === 1 ? 'player' : 'players'}
          </div>
        </div>

        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {!seated && (
            <>
              <button style={btn} onClick={() => joinQueue('8')} disabled={busy}>Join 8-ft</button>
              <button style={btn} onClick={() => joinQueue('9')} disabled={busy}>Join 9-ft</button>
            </>
          )}
          {(q8.includes(me.id) || q9.includes(me.id)) && (
            <button style={btnGhost} onClick={leaveQueues} disabled={busy}>Leave queue(s)</button>
          )}
          {seated && <button style={btnGhost} onClick={() => iLost()} disabled={busy}>I lost</button>}
        </div>
      </header>

      {/* ---------- TABLES (TOP) ---------- */}
      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{marginTop:0}}>Tables</h3>
          {iAmHost && (
            <button style={btnGhostSm} onClick={()=>setShowTableControls(v=>!v)}>
              {showTableControls ? 'Hide table settings' : 'Table settings'}
            </button>
          )}
        </div>

        {showTableControls && iAmHost && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginBottom:12}}>
            {g.tables.map((t, i) => (
              <div key={i} style={{background:'#111',border:'1px solid #333',borderRadius:10,padding:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:600,opacity:.9}}>Table {i+1}</div>
                  <select
                    value={t.label}
                    onChange={(e)=>commit(d=>{ d.tables[i].label = (e.currentTarget.value === '9 foot' ? '9 foot' : '8 foot'); })}
                    style={select}
                    disabled={busy}
                  >
                    <option value="9 foot">9-foot</option>
                    <option value="8 foot">8-foot</option>
                  </select>
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button
                style={btnGhostSm}
                onClick={()=>commit(d=>{ if (d.tables.length < 2) d.tables.push({ label: d.tables[0]?.label === '9 foot' ? '8 foot' : '9 foot' }); })}
                disabled={busy || g.tables.length >= 2}
              >Add second table</button>
              <button
                style={btnGhostSm}
                onClick={()=>commit(d=>{ if (d.tables.length > 1) d.tables = d.tables.slice(0,1); })}
                disabled={busy || g.tables.length <= 1}
              >Use one table</button>
            </div>
          </div>
        )}

        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap:12}}>
          {g.tables.map((t, i) => {
            const meHere = t.a===me.id || t.b===me.id;
            const Seat = ({ side }: { side:'a'|'b' }) => {
              const pid = t[side];
              return (
                <div
                  draggable={!!pid && iAmHost}
                  onDragStart={(e)=>pid && onDragStart(e,{type:'seat', table:i, side, pid})}
                  onDragOver={onDragOver}
                  onDrop={(e)=>handleDrop(e,{type:'seat', table:i, side, pid})}
                  style={{minHeight:24,padding:'8px 10px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:8,background:'rgba(56,189,248,.10)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}
                  title="Drag from queues or swap seats"
                >
                  <span>{nameOf(pid)}</span>
                  {pid && (iAmHost || pid===me.id) && (
                    <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>
                  )}
                </div>
              );
            };
            return (
              <div key={i} style={{background:'#0b3a66',borderRadius:12,padding:'12px 14px',border:'1px solid rgba(56,189,248,.35)'}}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ opacity:.9, fontSize:12 }}>{t.label === '9 foot' ? '9-Foot Table' : '8-Foot Table'} • Table {i+1}</div>
                </div>
                <div style={{ display:'grid', gap:8 }}>
                  <Seat side="a" />
                  <div style={{opacity:.7, textAlign:'center'}}>vs</div>
                  <Seat side="b" />
                </div>
                {meHere && <div style={{marginTop:8}}><button style={btnMini} onClick={()=>iLost()} disabled={busy}>I lost</button></div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- QUEUES ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queues</h3>
        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap:12}}>
          {/* 8-foot queue */}
          <div>
            <div style={{ opacity:.85, marginBottom:6 }}>8-foot queue ({q8.length})</div>
            <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
              {q8.map((pid, idx) => (
                <li key={`${pid}-q8-${idx}`} onDragOver={onDragOver} onDrop={(e)=>handleDrop(e,{type:'q8', index:idx, pid})}>
                  {pill(pid, { type:'q8', index: idx, pid }, 'Drag to reorder/move')}
                </li>
              ))}
              {/* drop to end */}
              <li onDragOver={onDragOver} onDrop={(e)=>handleDrop(e,{type:'q8', index:q8.length, pid:'__end' as any})} style={{ minHeight: 6 }} />
            </ul>
          </div>

          {/* 9-foot queue */}
          <div>
            <div style={{ opacity:.85, marginBottom:6 }}>9-foot queue ({q9.length})</div>
            <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
              {q9.map((pid, idx) => (
                <li key={`${pid}-q9-${idx}`} onDragOver={onDragOver} onDrop={(e)=>handleDrop(e,{type:'q9', index:idx, pid})}>
                  {pill(pid, { type:'q9', index: idx, pid }, 'Drag to reorder/move')}
                </li>
              ))}
              <li onDragOver={onDragOver} onDrop={(e)=>handleDrop(e,{type:'q9', index:q9.length, pid:'__end' as any})} style={{ minHeight: 6 }} />
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Host controls: add players etc. ---------- */}
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
            <button style={btnGhost} onClick={() => joinQueue('8')} disabled={busy}>Add me 8-ft</button>
            <button style={btnGhost} onClick={() => joinQueue('9')} disabled={busy}>Add me 9-ft</button>
          </div>
        </section>
      )}

      {/* ---------- Players list ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>List (Players) — {safePlayers.length}</h3>
        {safePlayers.length === 0 ? (
          <div style={{ opacity:.7 }}>No players yet.</div>
        ) : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {safePlayers.map((p) => (
              <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                <span>{p.name}</span>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button style={btnMini} onClick={() => renamePlayer(p.id)} disabled={busy}>Rename</button>
                  <button style={btnMini} onClick={() => quickSend(p.id, '8')} disabled={busy}>Send to 8-ft</button>
                  <button style={btnMini} onClick={() => quickSend(p.id, '9')} disabled={busy}>Send to 9-ft</button>
                  <button style={btnGhost} onClick={() => removePlayer(p.id)} disabled={busy}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );

  /* quick send from players list */
  async function quickSend(pid: string, which: '8'|'9') {
    await commit(d => {
      d.queue8 = d.queue8.filter(x => x !== pid);
      d.queue9 = d.queue9.filter(x => x !== pid);
      d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b }));
      (which === '9' ? d.queue9 : d.queue8).push(pid);
    });
  }
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const pillStyle: React.CSSProperties = { padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', minWidth:40, textAlign:'center' };
const pillBadge: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const input: React.CSSProperties = { width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const nameInput: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
const select: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:8, padding:'6px 8px' };
