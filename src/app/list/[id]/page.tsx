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
  prefs?: Record<string, Pref>;    // per-player preference
  v?: number;
  schema?: 'v2';                   // hint for server/clients (optional)
};

/* ---------- coerce & migration ---------- */
function tidyId(x: unknown): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t: any, i: number) => ({
          a: tidyId(t?.a) || undefined,
          b: tidyId(t?.b) || undefined,
          label:
            t?.label === '9 foot' || t?.label === '8 foot'
              ? t.label
              : i === 1
              ? '9 foot'
              : '8 foot',
        }))
      : [{ label: '8 foot' }, { label: '9 foot' }];

    const players: Player[] = Array.isArray(raw.players)
      ? raw.players
          .map((p: any) => {
            const id = tidyId(p?.id);
            const name = String(p?.name ?? '').trim() || 'Player';
            return id ? { id, name } : null;
          })
          .filter(Boolean) as Player[]
      : [];
    const has = (pid: string) => players.some((p) => p.id === pid);

    const hasSingleQueue = Array.isArray(raw.queue);

    // Build queue (prefer new field)
    let queue: string[] = [];
    if (hasSingleQueue) {
      queue = raw.queue.map((id: any) => String(id)).filter(has);
    } else {
      const q8 = Array.isArray(raw.queue8) ? raw.queue8.map((id: any) => String(id)) : [];
      const q9 = Array.isArray(raw.queue9) ? raw.queue9.map((id: any) => String(id)) : [];
      const seen = new Set<string>();
      [...q8, ...q9].forEach((id) => {
        if (has(id) && !seen.has(id)) { seen.add(id); queue.push(id); }
      });
    }

    // Preferences
    const prefs: Record<string, Pref> = {};
    if (raw.prefs && typeof raw.prefs === 'object') {
      Object.entries(raw.prefs as Record<string, any>).forEach(([pid, pref]) => {
        if (!has(pid)) return;
        prefs[pid] = pref === '9 foot' || pref === '8 foot' ? pref : 'any';
      });
    } else if (!hasSingleQueue) {
      // Only infer from legacy queues if the doc truly hasn’t migrated.
      const q8 = Array.isArray(raw.queue8) ? raw.queue8.map((id: any) => String(id)) : [];
      const q9 = Array.isArray(raw.queue9) ? raw.queue9.map((id: any) => String(id)) : [];
      q8.forEach((id) => { const pid = String(id); if (has(pid)) prefs[pid] = '8 foot'; });
      q9.forEach((id) => { const pid = String(id); if (has(pid)) prefs[pid] = '9 foot'; });
    }

    // Clean seats pointing to missing players
    tables.forEach((t) => {
      if (t.a && !has(t.a)) t.a = undefined;
      if (t.b && !has(t.b)) t.b = undefined;
    });

    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? 'Untitled'),
      code: raw.code ? String(raw.code) : undefined,
      hostId: String(raw.hostId ?? ''),
      status: 'active',
      createdAt: Number(raw.createdAt ?? Date.now()),
      tables,
      players,
      queue,
      prefs,
      v: Number(raw.v ?? 0),
      schema: 'v2',
    };
  } catch {
    return null;
  }
}

/* server PUT (server resolves versions) */
async function putList(doc: ListGame) {
  await fetch(`/api/list/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...doc, schema: 'v2', queue8: [], queue9: [] }), // clear legacy fields alongside v2
  });
}

export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [showTableControls, setShowTableControls] = useState(false);

  // race guards
  const suppressPollRef = useRef(false);
  const excludeSeatPidRef = useRef<string | null>(null);
  const commitQ = useRef<(() => Promise<void>)[]>([]);
  const watchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const id =
    typeof window !== 'undefined'
      ? decodeURIComponent(window.location.pathname.split('/').pop() || '')
      : '';

  const me = useMemo<Player>(() => {
    try {
      return JSON.parse(localStorage.getItem('kava_me') || 'null') || { id: uid(), name: 'Player' };
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

  const lastSeating = useRef<string>('');
  function detectMySeatingChanged(next: ListGame | null) {
    if (!next) return false;
    const i = next.tables.findIndex((t) => t.a === me.id || t.b === me.id);
    if (i < 0) {
      if (lastSeating.current !== '') { lastSeating.current = ''; return true; }
      return false;
    }
    const a = next.tables[i]?.a ?? 'x', b = next.tables[i]?.b ?? 'x';
    const key = `table-${i}-${a}-${b}`;
    if (key !== lastSeating.current) { lastSeating.current = key; return true; }
    return false;
  }

  useEffect(() => {
    if (!id) return;
    const stopper = startSmartPollETag<ListGame>({
      url: `/api/list/${encodeURIComponent(id)}`,
      key: `l:${id}`,
      versionHeader: 'x-l-version',
      onUpdate: (payload) => {
        if (suppressPollRef.current) return;
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
        <BackButton href="/" />
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
  const inQueue = (pid: string) => queue.includes(pid);

  /* ---------- auto-seat (use NEXT.prefs) ---------- */
  function autoSeat(next: ListGame): void {
    const has = (pid?: string) => !!pid && next.players.some(p => p.id === pid);
    const excluded = excludeSeatPidRef.current;
    const nextPrefs = next.prefs || {};

    const takeMatch = (predicate: (pid: string) => boolean) => {
      for (let i = 0; i < next.queue.length; i++) {
        const pid = next.queue[i];
        if (!has(pid)) { next.queue.splice(i,1); i--; continue; }
        if (excluded && pid === excluded) continue;
        if (predicate(pid)) { next.queue.splice(i,1); return pid; }
      }
      return undefined;
    };

    next.tables.forEach(t => {
      const want: Pref = t.label === '9 foot' ? '9 foot' : '8 foot';
      if (!t.a) {
        const pid = takeMatch(pid => (nextPrefs[pid] ?? 'any') === 'any' || (nextPrefs[pid] ?? 'any') === want);
        if (pid) t.a = pid;
      }
      if (!t.b) {
        const pid = takeMatch(pid => (nextPrefs[pid] ?? 'any') === 'any' || (nextPrefs[pid] ?? 'any') === want);
        if (pid) t.b = pid;
      }
    });

    excludeSeatPidRef.current = null;
  }

  /* ---------- commit queue (serialize + block poll) ---------- */
  async function runNext() {
    const fn = commitQ.current.shift();
    if (!fn) return;
    await fn();
    if (commitQ.current.length) runNext();
  }

  function scheduleCommit(mut: (draft: ListGame) => void) {
    commitQ.current.push(async () => {
      if (!g) return;
      const next: ListGame = JSON.parse(JSON.stringify(g));
      mut(next);
      autoSeat(next);

      suppressPollRef.current = true;
      setBusy(true);
      if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
      watchdogTimer.current = setTimeout(() => {
        setBusy(false);
        suppressPollRef.current = false;
      }, 10000);

      try {
        setG(next);
        await putList(next);
        if (detectMySeatingChanged(next)) bumpAlerts();
      } catch (e) {
        console.error('save failed', e);
      } finally {
        if (watchdogTimer.current) {
          clearTimeout(watchdogTimer.current);
          watchdogTimer.current = null;
        }
        setBusy(false);
        suppressPollRef.current = false;
      }
    });
    if (commitQ.current.length === 1) runNext();
  }

  /* ---------- actions ---------- */
  function renameList(newName: string) {
    const v = newName.trim(); if (!v) return;
    scheduleCommit(d => { d.name = v; });
  }

  function addPlayerManual() {
    const nm = nameField.trim(); if (!nm) return;
    setNameField('');
    const p: Player = { id: uid(), name: nm };
    scheduleCommit(d => {
      d.players.push(p);
      if (!d.queue.includes(p.id)) d.queue.push(p.id); // new players enter queue
      if (!d.prefs) d.prefs = {};
      d.prefs[p.id] = 'any';
    });
  }

  function removePlayer(pid: string) {
    scheduleCommit(d => {
      d.players = d.players.filter(p => p.id !== pid);
      d.queue = d.queue.filter(x => x !== pid);
      if (d.prefs) delete d.prefs[pid];
      d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b }));
    });
  }

  function renamePlayer(pid: string) {
    const cur = safePlayers.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    const v = nm.trim(); if (!v) return;
    scheduleCommit(d => {
      const p = d.players.find(pp => pp.id === pid);
      if (p) p.name = v;
    });
  }

  function ensureMe(d: ListGame) {
    if (!d.players.some(p => p.id === me.id)) d.players.push(me);
    if (!d.prefs) d.prefs = {};
    if (!d.prefs[me.id]) d.prefs[me.id] = 'any';
  }

  function joinMainQueue() {
    scheduleCommit(d => {
      ensureMe(d);
      if (!d.queue.includes(me.id)) d.queue.push(me.id);
    });
  }
  function leaveQueue() {
    scheduleCommit(d => { d.queue = d.queue.filter(x => x !== me.id); });
  }

  function setPrefFor(pid: string, p: Pref) {
    scheduleCommit(d => {
      if (!d.prefs) d.prefs = {};
      d.prefs[pid] = p;
    });
  }

  function addPidToQueue(pid: string) {
    scheduleCommit(d => { if (!d.queue.includes(pid)) d.queue.push(pid); });
  }
  function removePidFromQueue(pid: string) {
    scheduleCommit(d => { d.queue = d.queue.filter(x => x !== pid); });
  }

  function iLost(pid?: string) {
    const loser = pid ?? me.id;
    scheduleCommit(d => {
      const idx = d.tables.findIndex(tt => tt.a === loser || tt.b === loser);
      if (idx < 0) return;
      const t = d.tables[idx];
      if (t.a === loser) t.a = undefined;
      if (t.b === loser) t.b = undefined;
      d.queue = d.queue.filter(x => x !== loser);
      d.queue.push(loser);
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

  function handleDrop(ev: React.DragEvent, target: DragInfo) {
    ev.preventDefault();
    const src = parseInfo(ev);
    if (!src) return;

    scheduleCommit(d => {
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

  /* ---------- UI ---------- */
  return (
    <main style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        {/* Back goes home */}
        <BackButton href="/" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={() => location.reload()}>Refresh</button>
        </div>
      </div>

      {/* Name + code + Join */}
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
        </div>
      </header>

      {/* ---------- TABLES ---------- */}
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
                    onChange={(e)=>scheduleCommit(d=>{ d.tables[i].label = (e.currentTarget.value === '9 foot' ? '9 foot' : '8 foot'); })}
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
                onClick={()=>scheduleCommit(d=>{ if (d.tables.length < 2) d.tables.push({ label: d.tables[0]?.label === '9 foot' ? '8 foot' : '9 foot' }); })}
                disabled={busy || g.tables.length >= 2}
              >Add second table</button>
              <button
                style={btnGhostSm}
                onClick={()=>scheduleCommit(d=>{ if (d.tables.length > 1) d.tables = d.tables.slice(0,1); })}
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
                <div style={{ opacity:.9, fontSize:12, marginBottom:6 }}>
                  {t.label === '9 foot' ? '9-Foot Table' : '8-Foot Table'} • Table {i+1}
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

      {/* ---------- QUEUE with inline pref toggles ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
        {queue.length === 0 ? (
          <div style={{opacity:.6,fontStyle:'italic'}}>Drop players here</div>
        ) : (
          <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}
              onDragOver={onDragOver}
              onDrop={(e)=>handleDrop(e,{type:'queue', index: queue.length, pid: '__end' as any})}>
            {queue.map((pid, idx) => {
              const canEditPref = iAmHost || pid === me.id;
              const pref = (g.prefs?.[pid] ?? 'any') as Pref;
              return (
                <li
                  key={`${pid}-${idx}`}
                  draggable
                  onDragStart={e=>onDragStart(e,{type:'queue', index: idx, pid})}
                  onDragOver={onDragOver}
                  onDrop={e=>handleDrop(e,{type:'queue', index: idx, pid})}
                  style={{cursor:'grab', display:'flex', alignItems:'center', gap:10, justifyContent:'space-between'}}
                  title="Drag to reorder, move between players, or seat on a table"
                >
                  <span style={{flex:'1 1 auto'}}>{nameOf(pid)}</span>
                  <div style={{display:'flex',gap:6}}>
                    {canEditPref ? (
                      <>
                        <button style={pref==='any' ? btnTinyActive : btnTiny} onClick={(e)=>{ e.stopPropagation(); setPrefFor(pid,'any'); }} disabled={busy}>Any</button>
                        <button style={pref==='9 foot' ? btnTinyActive : btnTiny} onClick={(e)=>{ e.stopPropagation(); setPrefFor(pid,'9 foot'); }} disabled={busy}>9-ft</button>
                        <button style={pref==='8 foot' ? btnTinyActive : btnTiny} onClick={(e)=>{ e.stopPropagation(); setPrefFor(pid,'8 foot'); }} disabled={busy}>8-ft</button>
                      </>
                    ) : (
                      <small style={{opacity:.7,width:48,textAlign:'right'}}>{pref==='any'?'Any':pref==='9 foot'?'9-ft':'8-ft'}</small>
                    )}
                  </div>
                </li>
              );
            })}
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
            <button style={btn} onClick={addPlayerManual} disabled={busy || !nameField.trim()}>
              Add player (joins queue)
            </button>
          </div>
        </section>
      )}

      {/* ---------- Players (now with Queue / Dequeue + Prefs) ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>List (Players) — {safePlayers.length}</h3>
        {safePlayers.length === 0 ? (
          <div style={{ opacity:.7 }}>No players yet.</div>
        ) : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {safePlayers.map((p) => {
              const pref = (g.prefs?.[p.id] ?? 'any') as Pref;
              const canEditPref = iAmHost || p.id === me.id;
              return (
                <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                  <span>{p.name}</span>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {/* Queue/Dequeue */}
                    {!inQueue(p.id)
                      ? <button style={btnMini} onClick={()=>addPidToQueue(p.id)} disabled={busy}>Queue</button>
                      : <button style={btnMini} onClick={()=>removePidFromQueue(p.id)} disabled={busy}>Dequeue</button>
                    }

                    {/* Inline prefs (host or self) */}
                    {canEditPref && (
                      <div style={{display:'flex',gap:6}}>
                        <button style={pref==='any'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'any')} disabled={busy}>Any</button>
                        <button style={pref==='9 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'9 foot')} disabled={busy}>9-ft</button>
                        <button style={pref==='8 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'8 foot')} disabled={busy}>8-ft</button>
                      </div>
                    )}

                    <button style={btnMini} onClick={() => renamePlayer(p.id)} disabled={busy}>Rename</button>
                    <button style={btnGhost} onClick={() => removePlayer(p.id)} disabled={busy}>Remove</button>
                  </div>
                </li>
              );
            })}
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
const btnTiny: React.CSSProperties = { padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12, lineHeight:1 };
const btnTinyActive: React.CSSProperties = { ...btnTiny, background:'#0ea5e9', border:'none' };
const pillBadge: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const input: React.CSSProperties = { width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const nameInput: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
const select: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:8, padding:'6px 8px' };
