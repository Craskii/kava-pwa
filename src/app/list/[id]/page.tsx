// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { startAdaptivePoll } from '@/lib/poll';
import { uid } from '@/lib/storage';

type Player = { id: string; name: string };
type TableKind = 8 | 9;
type Table = { a?: string; b?: string; kind: TableKind };

type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: 'active';
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];        // single combined queue
  v?: number;
};

function coerce(x: any): ListGame | null {
  if (!x) return null;
  try {
    const tables: Table[] = Array.isArray(x.tables)
      ? x.tables.map((t: any, i: number) => ({
          a: t?.a, b: t?.b,
          kind: (t?.kind === 9 || t?.kind === 8) ? t.kind : ((i === 0 ? 9 : 8) as TableKind),
        }))
      : [{ kind: 9 }, { kind: 8 }];

    const queue: string[] =
      Array.isArray(x.queue) ? x.queue.map((id: any) => String(id))
      : Array.isArray(x.qAny) ? x.qAny.map((id: any) => String(id)) // migrate old combined
      : [];

    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? 'Untitled'),
      code: x?.code ? String(x.code) : undefined,
      hostId: String(x.hostId ?? ''),
      status: 'active',
      createdAt: Number(x.createdAt ?? Date.now()),
      tables,
      players: Array.isArray(x.players)
        ? x.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') }))
        : [],
      queue,
      v: Number(x.v ?? 0),
    };
  } catch {
    return null;
  }
}

export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const verRef = useRef<string | null>(null);
  const lastSeatSig = useRef<string>('');
  const autoJoinedRef = useRef(false);
  const excludeSeatPidRef = useRef<string | null>(null); // prevents instant reseat of loser

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

  function detectSeatChange(next: ListGame | null) {
    if (!next) return false;
    const idx = next.tables.findIndex(t => t.a === me.id || t.b === me.id);
    if (idx < 0) {
      if (lastSeatSig.current !== '') { lastSeatSig.current = ''; return true; }
      return false;
    }
    const t = next.tables[idx];
    const sig = `t${idx}-${t.a ?? 'x'}-${t.b ?? 'x'}-${t.kind}`;
    if (sig !== lastSeatSig.current) { lastSeatSig.current = sig; return true; }
    return false;
  }

  async function getOnce() {
    if (!id) return null;
    const res = await fetch(`/api/list/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('load-failed');
    const json = await res.json();
    const doc = coerce(json);
    verRef.current = res.headers.get('x-l-version');
    return doc;
  }

  async function putDoc(next: ListGame) {
    const res = await fetch(`/api/list/${encodeURIComponent(next.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(verRef.current ? { 'if-match': verRef.current } : {}) },
      body: JSON.stringify(next),
    });
    if (!res.ok && res.status !== 204) throw new Error(`save-failed-${res.status}`);
    const v = res.headers.get('x-l-version'); if (v) verRef.current = v;
  }

  function ensureValidQueueRefs(d: ListGame) {
    const has = (pid: string) => d.players.some(p => p.id === pid);
    d.queue = d.queue.filter(has);
  }

  function takeFromQueue(next: ListGame): string | undefined {
    const has = (pid?: string) => !!pid && next.players.some(p => p.id === pid);
    const excluded = excludeSeatPidRef.current;

    while (next.queue.length) {
      const pid = next.queue[0];
      if (!has(pid)) { next.queue.shift(); continue; }
      if (excluded && pid === excluded) { next.queue.push(next.queue.shift()!); continue; }
      return next.queue.shift()!;
    }
    return undefined;
  }

  function autoSeat(doc: ListGame): ListGame {
    const next = structuredClone(doc) as ListGame;
    ensureValidQueueRefs(next);
    let changed = false;
    for (const t of next.tables) {
      if (!t.a) { const pid = takeFromQueue(next); if (pid) { t.a = pid; changed = true; } }
      if (!t.b) { const pid = takeFromQueue(next); if (pid) { t.b = pid; changed = true; } }
    }
    // clear exclusion after one pass
    excludeSeatPidRef.current = null;
    return changed ? next : doc;
  }

  async function save(mut: (x: ListGame) => void, opts?: { skipAutoSeat?: boolean }) {
    if (!g || busy) return;
    setBusy(true);
    try {
      const latest = await getOnce();
      if (!latest) throw new Error('no-latest');
      let next = structuredClone(latest) as ListGame;
      mut(next);
      if (!opts?.skipAutoSeat) next = autoSeat(next);
      await putDoc(next);
      setG(next);
      if (detectSeatChange(next)) bumpAlerts();
    } catch {
      try {
        const latest2 = await getOnce();
        if (!latest2) throw new Error('no-latest-2');
        let next2 = structuredClone(latest2) as ListGame;
        mut(next2);
        if (!opts?.skipAutoSeat) next2 = autoSeat(next2);
        await putDoc(next2);
        setG(next2);
        if (detectSeatChange(next2)) bumpAlerts();
      } catch {
        alert('Could not change.');
      }
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!id) return;
    let stopped = false;

    const stopper = startAdaptivePoll<ListGame>({
      key: `l:${id}`,
      minMs: 4000,
      maxMs: 60000,
      fetchOnce: async (etag) => {
        const res = await fetch(`/api/list/${encodeURIComponent(id)}`, {
          headers: etag ? { 'If-None-Match': etag } : undefined,
          cache: 'no-store',
        });
        const vHdr = res.headers.get('x-l-version');
        if (vHdr) verRef.current = vHdr;
        if (res.status === 304) return { status: 304, etag: etag ?? null };
        if (!res.ok) return { status: 304, etag: etag ?? null };
        const payload = await res.json();
        const newTag = res.headers.get('etag') || res.headers.get('x-l-version') || null;
        return { status: 200, etag: newTag, payload };
      },
      onChange: (payload) => {
        if (stopped) return;
        const doc = coerce(payload);
        if (!doc) return;
        setG(doc);
        if (detectSeatChange(doc)) bumpAlerts();
      },
    });

    (async () => {
      try {
        const doc = await getOnce();
        if (doc) { setG(doc); if (detectSeatChange(doc)) bumpAlerts(); }
      } catch {}
    })();

    return () => { stopped = true; stopper.stop(); };
  }, [id]);

  // Auto-join visitors (non-host) to the Queue
  useEffect(() => {
    if (!g || autoJoinedRef.current) return;
    const isHost = me.id === g.hostId;
    const inPlayers = g.players.some(p => p.id === me.id);
    const inQueue = g.queue.includes(me.id);
    const seated = g.tables.some(t => t.a === me.id || t.b === me.id);

    if (!isHost && !inPlayers && !inQueue && !seated) {
      autoJoinedRef.current = true;
      save(d => {
        if (!d.players.some(p => p.id === me.id)) d.players.push(me);
        if (!d.queue.includes(me.id)) d.queue.push(me.id);
      });
    }
  }, [g, me.id]);

  const players = g?.players ?? [];
  const tables = g?.tables ?? [];
  const isHost = !!g && me.id === g.hostId;
  const seatedIdx = tables.findIndex(t => t.a === me.id || t.b === me.id);
  const queued = !!g && g.queue.includes(me.id);
  const seated = seatedIdx >= 0;

  function nameOf(id?: string) { if (!id) return '—'; return players.find(p => p.id === id)?.name || '??'; }

  async function refreshOnce() { try { setBusy(true); const doc = await getOnce(); if (doc) setG(doc); } finally { setBusy(false); } }
  async function onRenameList(newName: string) { const v = newName.trim(); if (!g || !v) return; await save(d => { d.name = v; }); }

  async function onAddPlayer() {
    if (!g || !nameField.trim()) return;
    const nm = nameField.trim(); setNameField('');
    await save(d => {
      const p: Player = { id: uid(), name: nm };
      d.players.push(p);
      if (!d.queue.includes(p.id)) d.queue.push(p.id);
    });
  }

  async function onAddMe() {
    if (!g) return;
    await save(d => {
      if (!d.players.some(p => p.id === me.id)) d.players.push(me);
      if (d.tables.some(t => t.a === me.id || t.b === me.id)) return;
      if (!d.queue.includes(me.id)) d.queue.push(me.id);
    });
  }

  async function onRemovePlayer(pid: string) {
    await save(d => {
      d.players = d.players.filter(p => p.id !== pid);
      d.queue = d.queue.filter(x => x !== pid);
      d.tables.forEach(t => { if (t.a === pid) t.a = undefined; if (t.b === pid) t.b = undefined; });
    });
  }

  async function onRenamePlayer(pid: string) {
    const cur = players.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur); if (!nm) return;
    await save(d => { const p = d.players.find(pp => pp.id === pid); if (p) p.name = nm.trim() || p.name; });
  }

  async function onLeaveQueue(pid: string) {
    await save(d => { d.queue = d.queue.filter(x => x !== pid); });
  }

  // "Lost": remove from seat, push to end of queue, and seat NEXT person (not the loser)
  async function onILost(pid?: string) {
    if (!g) return;
    const myId = pid ?? me.id;
    await save(d => {
      const idx = d.tables.findIndex(tt => tt.a === myId || tt.b === myId);
      if (idx < 0) return;
      const t = d.tables[idx];
      if (t.a === myId) t.a = undefined;
      if (t.b === myId) t.b = undefined;

      // remove from queue if somehow present
      d.queue = d.queue.filter(x => x !== myId);
      // push loser to END of queue
      d.queue.push(myId);

      // prevent that same player from being re-seated in this pass
      excludeSeatPidRef.current = myId;
    });
  }

  // ---------- Drag & Drop ----------
  type DInfo =
    | { type: 'queue'; index: number; pid: string }
    | { type: 'queue-empty' }
    | { type: 'players'; index: number; pid: string }
    | { type: 'players-empty' }
    | { type: 'seat'; table: number; side: 'a'|'b'; pid?: string };

  function onDragStart(ev: React.DragEvent, info: DInfo) {
    ev.dataTransfer.setData('application/json', JSON.stringify(info));
    ev.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(ev: React.DragEvent) { ev.preventDefault(); }

  async function onDrop(ev: React.DragEvent, dst: DInfo) {
    if (!g || busy) return;
    ev.preventDefault();
    let src: DInfo | null = null;
    try { src = JSON.parse(ev.dataTransfer.getData('application/json')); } catch {}
    if (!src) return;

    await save(d => {
      const removeEverywhere = (pid: string) => {
        d.queue = d.queue.filter(x => x !== pid);
        d.tables.forEach(t => { if (t.a === pid) t.a = undefined; if (t.b === pid) t.b = undefined; });
      };

      const moveInArray = (arr: string[], pid: string, toIndex: number) => {
        const filtered = arr.filter(x => x !== pid);
        const idx = Math.max(0, Math.min(toIndex, filtered.length));
        filtered.splice(idx, 0, pid);
        return filtered;
      };

      let movingPid: string | undefined;
      if (src.type === 'queue') movingPid = src.pid;
      if (src.type === 'players') movingPid = src.pid;
      if (src.type === 'seat') movingPid = d.tables[src.table][src.side];
      if (!movingPid) return;

      if (src.type === 'players' && (dst.type === 'players' || dst.type === 'players-empty')) {
        const order = d.players.map(p => p.id);
        const newOrder = moveInArray(order, movingPid, dst.type === 'players' ? dst.index : order.length);
        d.players = newOrder.map(id => d.players.find(p => p.id === id)!).filter(Boolean);
        return;
      }

      removeEverywhere(movingPid);

      if (dst.type === 'queue' || dst.type === 'queue-empty') {
        if (dst.type === 'queue') d.queue = moveInArray(d.queue, movingPid, dst.index);
        else d.queue.push(movingPid);
      } else if (dst.type === 'players' || dst.type === 'players-empty') {
        if (!d.players.some(p => p.id === movingPid)) d.players.push({ id: movingPid, name: 'Player' });
        const order = d.players.map(p => p.id);
        const newOrder = moveInArray(order, movingPid, dst.type === 'players' ? dst.index : order.length);
        d.players = newOrder.map(id => d.players.find(p => p.id === id)!).filter(Boolean);
      } else {
        const t = d.tables[dst.table];
        if (dst.side === 'a') t.a = movingPid; else t.b = movingPid;
      }
    });
  }

  if (!g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <p style={{ opacity: .7 }}>Loading…</p>
        <div><button style={btnGhostSm} onClick={refreshOnce} disabled={busy}>Retry</button></div>
      </main>
    );
  }

  const playersCount = g.players.length;

  return (
    <main style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/lists" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={refreshOnce} disabled={busy}>Refresh</button>
        </div>
      </div>

      {/* ---------- TABLES (TOP) ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Tables</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', gap:12}}>
          {g.tables.map((t, i) => {
            const label = t.kind === 9 ? '9-Foot Table' : '8-Foot Table';
            const Seat = ({ side }: { side:'a'|'b' }) => {
              const pid = t[side];
              const info: DInfo = { type:'seat', table:i, side, pid };
              const canShowLost = isHost || pid === me.id;
              return (
                <div
                  draggable={!!pid}
                  onDragStart={(e)=> pid && onDragStart(e, info)}
                  onDragOver={onDragOver}
                  onDrop={(e)=>onDrop(e, info)}
                  style={{minHeight:24, padding:'8px 10px', border:'1px dashed rgba(255,255,255,.25)', borderRadius:8, background:'rgba(56,189,248,.10)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}
                  title="Drag from queue/players or swap seats"
                >
                  <span>{nameOf(pid)}</span>
                  {pid && canShowLost && <button style={btnMini} onClick={()=>onILost(pid)} disabled={busy}>Lost</button>}
                </div>
              );
            };
            return (
              <div key={i} style={{ background:'#0b3a66', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(56,189,248,.35)'}}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ opacity:.9, fontSize:12 }}>{label}</div>
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

      {/* ---------- QUEUE (single, like your screenshot) ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queue ({g.queue.length})</h3>
        {g.queue.length === 0 ? (
          <div style={{opacity:.6,fontStyle:'italic'}}>Drop players here</div>
        ) : (
          <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}
              onDragOver={onDragOver}
              onDrop={(e)=>onDrop(e,{type:'queue-empty'})}>
            {g.queue.map((pid, idx) => (
              <li
                key={`${pid}-${idx}`}
                draggable
                onDragStart={e=>onDragStart(e,{type:'queue', index: idx, pid})}
                onDragOver={onDragOver}
                onDrop={e=>onDrop(e,{type:'queue', index: idx, pid})}
                style={{cursor:'grab'}}
                title="Drag to reorder, move between players, or seat on a table"
              >
                {nameOf(pid)}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---------- LIST (Players) ---------- */}
      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{margin:'0 0 8px'}}>List (Players) — {playersCount}</h3>
          <div style={{display:'flex',gap:8}}>
            {isHost && (
              <>
                <input
                  placeholder="Add player name..."
                  value={nameField}
                  onChange={(e) => setNameField(e.target.value)}
                  style={input}
                  disabled={busy}
                />
                <button style={btn} onClick={onAddPlayer} disabled={busy || !nameField.trim()}>Add</button>
              </>
            )}
          </div>
        </div>

        {playersCount === 0 ? (
          <div style={{ opacity:.7 }}>No players yet.</div>
        ) : (
          <ul
            style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}
            onDragOver={onDragOver}
            onDrop={(e)=>onDrop(e,{type:'players-empty'})}
          >
            {g.players.map((p, idx) => (
              <li
                key={p.id}
                draggable
                onDragStart={e=>onDragStart(e,{type:'players', index: idx, pid: p.id})}
                onDragOver={onDragOver}
                onDrop={e=>onDrop(e,{type:'players', index: idx, pid: p.id})}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10, cursor:'grab' }}
                title="Drag to reorder or move to the queue/table"
              >
                <span>{p.name}</span>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {isHost && <button style={btnMini} onClick={()=>onRenamePlayer(p.id)} disabled={busy}>Rename</button>}
                  {isHost && <button style={btnGhost} onClick={()=>onRemovePlayer(p.id)} disabled={busy}>Remove</button>}
                  {g.queue.includes(p.id)
                    ? <button style={btnGhost} onClick={()=>onLeaveQueue(p.id)} disabled={busy}>Leave queue</button>
                    : <button style={btnGhostSm} onClick={onAddMe} disabled={busy || p.id !== me.id}>Join queue</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- INFO & NAME / CODE ---------- */}
      <section style={notice}>
        <b>How it works:</b> One Queue feeds all tables. When a player clicks <i>Lost</i>, their seat frees, the next person in Queue is seated, and the loser goes to the end.
      </section>

      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input
              defaultValue={g.name}
              onBlur={(e) => onRenameList(e.currentTarget.value)}
              style={nameInput}
              disabled={busy}
            />
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Private code: <b>{g.code || '—'}</b> • {playersCount} {playersCount === 1 ? 'player' : 'players'}
          </div>
        </div>

        <div style={{display:'grid',gridAutoFlow:'row',gap:6}}>
          {!seated && !queued && <button style={btn} onClick={onAddMe} disabled={busy}>Join queue</button>}
          {queued && <button style={btnGhost} onClick={()=>onLeaveQueue(me.id)} disabled={busy}>Leave queue</button>}
          {seated && <button style={btnGhost} onClick={()=>onILost()} disabled={busy}>I lost</button>}
        </div>
      </header>
    </main>
  );
}

/* ------------------- styles ------------------- */
const wrap: React.CSSProperties = {
  minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui'
};
const notice: React.CSSProperties = {
  background:'rgba(14,165,233,.12)', border:'1px solid rgba(14,165,233,.25)',
  borderRadius:12, padding:'10px 12px', margin:'8px 0 14px'
};
const card: React.CSSProperties = {
  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
  borderRadius:14, padding:14, marginBottom:14
};
const pillBadge: React.CSSProperties = {
  padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)',
  border:'1px solid rgba(16,185,129,.35)', fontSize:12
};
const btn: React.CSSProperties = {
  padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer'
};
const btnGhost: React.CSSProperties = {
  padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer'
};
const btnGhostSm: React.CSSProperties = {
  padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600
};
const btnMini: React.CSSProperties = {
  padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12
};
const nameInput: React.CSSProperties = {
  background:'#111', border:'1px solid #333', color:'#fff',
  borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)'
};
const input: React.CSSProperties = {
  width:260, maxWidth:'90vw', padding:'10px 12px',
  borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff'
};
