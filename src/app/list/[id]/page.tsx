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
type Pref = '8 foot' | '9 foot' | 'any';

type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: 'active';
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];                 // single main queue
  prefs?: Record<string, Pref>;    // optional preference per player
  v?: number;
};

/* ---------- coerce & migration ---------- */
function coerceList(x: any): ListGame | null {
  if (!x) return null;
  try {
    const tables: Table[] = Array.isArray(x.tables)
      ? x.tables.map((t: any, i: number) => ({
          a: t?.a, b: t?.b,
          label: t?.label === '9 foot' || t?.label === '8 foot' ? t.label : (i === 1 ? '9 foot' : '8 foot'),
        }))
      : [{ label: '8 foot' }, { label: '9 foot' }];

    /* Migrations:
       - old two-queue shape (queue8/queue9) → one main queue (preserve order, dedupe)
       - infer prefs from old queues: if in queue9 → '9 foot', if in queue8 → '8 foot'
    */
    let queue: string[] = [];
    let prefs: Record<string, Pref> = {};

    if (Array.isArray(x.queue)) {
      queue = x.queue.map((id: any) => String(id));
    } else {
      const q8 = Array.isArray(x.queue8) ? x.queue8.map((id: any) => String(id)) : [];
      const q9 = Array.isArray(x.queue9) ? x.queue9.map((id: any) => String(id)) : [];
      const seen = new Set<string>();
      // Preserve relative order: first existing 8 queue, then 9 queue
      [...q8, ...q9].forEach(id => { if (!seen.has(id)) { seen.add(id); queue.push(id); } });
      // Preferences
      q8.forEach(id => prefs[id] = '8 foot');
      q9.forEach(id => prefs[id] = '9 foot');
    }

    // coerce prefs object if present
    if (x.prefs && typeof x.prefs === 'object') {
      try {
        const raw = x.prefs as Record<string, any>;
        Object.keys(raw).forEach(k => {
          const val = raw[k] === '9 foot' || raw[k] === '8 foot' ? raw[k] : 'any';
          prefs[k] = val;
        });
      } catch {}
    }

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
      queue,
      prefs,
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

  // polling (ETag smart poll)
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
  const queue = g.queue;
  const prefs = g.prefs || {};
  const safePlayers = g.players;

  function nameOf(pid?: string) {
    if (!pid) return '—';
    return safePlayers.find(p => p.id === pid)?.name || '??';
  }

  /* ---------- auto-seat (single queue + preference match) ---------- */
  function autoSeat(next: ListGame): ListGame {
    const has = (pid?: string) => !!pid && next.players.some(p => p.id === pid);
    const excluded = excludeSeatPidRef.current;

    // helper: find & take first pid in queue matching predicate
    const takeMatch = (predicate: (pid: string) => boolean) => {
      for (let i = 0; i < next.queue.length; i++) {
        const pid = next.queue[i];
        if (!has(pid)) { next.queue.splice(i,1); i--; continue; }
        if (excluded && pid === excluded) continue;
        if (predicate(pid)) {
          next.queue.splice(i,1);
          return pid;
        }
      }
      return undefined;
    };

    let changed = false;
    next.tables.forEach(t => {
      const want: Pref = t.label === '9 foot' ? '9 foot' : '8 foot';
      if (!t.a) {
        const pid = takeMatch((pid) => (prefs[pid] ?? 'any') === 'any' || (prefs[pid] ?? 'any') === want);
        if (pid) { t.a = pid; changed = true; }
      }
      if (!t.b) {
        const pid = takeMatch((pid) => (prefs[pid] ?? 'any') === 'any' || (prefs[pid] ?? 'any') === want);
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
    await commit(d => {
      d.players.push(p);
      if (!d.queue.includes(p.id)) d.queue.push(p.id); // immediately into the main queue
      if (!d.prefs) d.prefs = {};
      d.prefs[p.id] = 'any';
    });
  }

  async function removePlayer(pid: string) {
    await commit(d => {
      d.players = d.players.filter(p => p.id !== pid);
      d.queue = d.queue.filter(x => x !== pid);
      if (d.prefs) delete d.prefs[pid];
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

  function ensureMe(d: ListGame) {
    if (!d.players.some(p => p.id === me.id)) d.players.push(me);
    if (!d.prefs) d.prefs = {};
    if (!d.prefs[me.id]) d.prefs[me.id] = 'any';
  }

  async function joinMainQueue() {
    await commit(d => {
      ensureMe(d);
      if (!d.queue.includes(me.id)) d.queue.push(me.id);
    });
  }
  async function leaveQueue() {
    await commit(d => { d.queue = d.queue.filter(x => x !== me.id); });
  }

  async function setPref(p: Pref) {
    await commit(d => {
      ensureMe(d);
      d.prefs![me.id] = p;
    });
  }

  // Seat-side "Lost"
  async function iLost(pid?: string) {
    const loser = pid ?? me.id;
    await commit(d => {
      const idx = d.tables.findIndex(tt => tt.a === loser || tt.b === loser);
      if (idx < 0) return;
      const t = d.tables[idx];
      if (t.a === loser) t.a = undefined;
      if (t.b === loser) t.b = undefined;

      // move to end of main queue (preference unchanged)
      d.queue = d.queue.filter(x => x !== loser);
      d.queue.push(loser);

      // exclude this player in the immediate autoSeat pass
      excludeSeatPidRef.current = loser;
    });
  }

  /* ---------- drag & drop ---------- */
  type DragInfo =
    | { type: 'seat'; table: number; side: 'a'|'b'; pid?: string }
    | { type: 'queue'; index: number; pid: string };

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
      const removeEverywhere = (pid: string) => {
        d.queue = d.queue.filter(x => x !== pid);
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
        } else if (src.type === 'queue') {
          const pid = src.pid;
          d.queue = d.queue.filter(x => x !== pid);
          placeSeat(target.table, target.side, pid);
        }
      } else if (target.type === 'queue') {
        if (src.type === 'queue') {
          d.queue = moveWithin(d.queue, src.index, target.index);
        } else if (src.type === 'seat') {
          const pid = d.tables[src.table][src.side];
          d.tables[src.table][src.side] = undefined;
          if (pid) d.queue.splice(target.index, 0, pid);
        }
      }
    });
  }

  const myPref: Pref = (g.prefs?.[me.id] ?? 'any');

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

      {/* Name + code + Join/Pref controls */}
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

        <div style={{display:'grid',gap:6,justifyItems:'end'}}>
          {!seated && !queue.includes(me.id) && (
            <button style={btn} onClick={joinMainQueue} disabled={busy}>Join queue</button>
          )}
          {queue.includes(me.id) && (
            <button style={btnGhost} onClick={leaveQueue} disabled={busy}>Leave queue</button>
          )}
          {/* Preference buttons (affect auto-seat, not queue order) */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <button
              style={myPref==='9 foot'?btn:btnGhostSm}
              onClick={()=>setPref('9 foot')}
              disabled={busy}
              title="Prefer the larger (9-ft) table"
            >Wait for 9-ft</button>
            <button
              style={myPref==='8 foot'?btn:btnGhostSm}
              onClick={()=>setPref('8 foot')}
              disabled={busy}
              title="Prefer the smaller (8-ft) table"
            >Wait for 8-ft</button>
            <button
              style={myPref==='any'?btn:btnGhostSm}
              onClick={()=>setPref('any')}
              disabled={busy}
              title="No preference; first available"
            >No preference</button>
          </div>
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
            const Seat = ({ side }: { side:'a'|'b' }) => {
              const pid = t[side];
              return (
                <div
                  draggable={!!pid && iAmHost}
                  onDragStart={(e)=>pid && onDragStart(e,{type:'seat', table:i, side, pid})}
                  onDragOver={onDragOver}
                  onDrop={(e)=>handleDrop(e,{type:'seat', table:i, side, pid})}
                  style={{minHeight:24,padding:'8px 10px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:8,background:'rgba(56,189,248,.10)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}
                  title="Drag from queue or swap seats"
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
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- QUEUE (single) ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
        {queue.length === 0 ? (
          <div style={{opacity:.6,fontStyle:'italic'}}>Drop players here</div>
        ) : (
          <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}
              onDragOver={onDragOver}
              onDrop={(e)=>handleDrop(e,{type:'queue', index: queue.length, pid: '__end' as any})}>
            {queue.map((pid, idx) => (
              <li
                key={`${pid}-${idx}`}
                draggable
                onDragStart={e=>onDragStart(e,{type:'queue', index: idx, pid})}
                onDragOver={onDragOver}
                onDrop={e=>handleDrop(e,{type:'queue', index: idx, pid})}
                style={{cursor:'grab', display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}
                title="Drag to reorder, move between players, or seat on a table"
              >
                <span>{nameOf(pid)}</span>
                <small style={{opacity:.7}}>{
                  (g.prefs?.[pid] ?? 'any') === 'any' ? 'Any' :
                  (g.prefs?.[pid] === '9 foot' ? '9-ft' : '8-ft')
                }</small>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---------- Host controls ---------- */}
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
            <button style={btn} onClick={addPlayerManual} disabled={busy || !nameField.trim()}>Add player (joins queue)</button>
          </div>
        </section>
      )}

      {/* ---------- Players ---------- */}
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
                  <button style={btnGhost} onClick={() => removePlayer(p.id)} disabled={busy}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const pillBadge: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const input: React.CSSProperties = { width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const nameInput: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
const select: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:8, padding:'6px 8px' };
