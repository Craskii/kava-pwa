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
  q8: string[];
  q9: string[];
  qAny: string[];
  lostToAny?: boolean;
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
      q8: Array.isArray(x.q8) ? x.q8.map((id: any) => String(id)) : [],
      q9: Array.isArray(x.q9) ? x.q9.map((id: any) => String(id)) : [],
      // migrate old single-queue → Combined
      qAny: Array.isArray(x.qAny)
        ? x.qAny.map((id: any) => String(id))
        : (Array.isArray(x.queue) ? x.queue.map((id: any) => String(id)) : []),
      lostToAny: Boolean(x.lostToAny ?? false),
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
  const [showTModal, setShowTModal] = useState(false);
  const [tCount, setTCount] = useState<1 | 2>(2);
  const [t0Kind, setT0Kind] = useState<TableKind>(9);
  const [t1Kind, setT1Kind] = useState<TableKind>(8);

  const verRef = useRef<string | null>(null);
  const lastSeatSig = useRef<string>('');
  const autoJoinedRef = useRef(false); // prevents double auto-join
  const excludeSeatPidRef = useRef<string | null>(null); // prevent instant reseat on "Lost"

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
    d.q8 = d.q8.filter(has);
    d.q9 = d.q9.filter(has);
    d.qAny = d.qAny.filter(has);
  }

  function takeFromQueues(next: ListGame, kind: TableKind): string | undefined {
    const has = (pid?: string) => !!pid && next.players.some(p => p.id === pid);
    const excluded = excludeSeatPidRef.current;

    const takeFrom = (arr: string[]) => {
      while (arr.length) {
        const pid = arr[0];
        if (!has(pid)) { arr.shift(); continue; }
        if (excluded && pid === excluded) { // skip once for the loser this tick
          // move skipped pid to end and continue
          arr.push(arr.shift()!);
          continue;
        }
        return arr.shift()!;
      }
      return undefined;
    };

    if (kind === 8) {
      const p = takeFrom(next.q8); if (p) return p;
    } else {
      const p = takeFrom(next.q9); if (p) return p;
    }
    return takeFrom(next.qAny);
  }

  function autoSeat(doc: ListGame): ListGame {
    const next = structuredClone(doc) as ListGame;
    ensureValidQueueRefs(next);
    let changed = false;
    for (const t of next.tables) {
      if (!t.a) { const pid = takeFromQueues(next, t.kind); if (pid) { t.a = pid; changed = true; } }
      if (!t.b) { const pid = takeFromQueues(next, t.kind); if (pid) { t.b = pid; changed = true; } }
    }
    // clear the exclude after a single autoSeat pass
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

  // ---------- AUTO-JOIN visitor (non-host) to Combined ----------
  useEffect(() => {
    if (!g || autoJoinedRef.current) return;
    const isHost = me.id === g.hostId;
    const inPlayers = g.players.some(p => p.id === me.id);
    const inQueues = g.q8.includes(me.id) || g.q9.includes(me.id) || g.qAny.includes(me.id);
    const seated = g.tables.some(t => t.a === me.id || t.b === me.id);

    if (!isHost && !inPlayers && !inQueues && !seated) {
      autoJoinedRef.current = true;
      // add & queue to Combined
      save(d => {
        if (!d.players.some(p => p.id === me.id)) d.players.push(me);
        d.q8 = d.q8.filter(x => x !== me.id);
        d.q9 = d.q9.filter(x => x !== me.id);
        if (!d.qAny.includes(me.id)) d.qAny.push(me.id);
      });
    }
  }, [g, me.id]);

  const players = g?.players ?? [];
  const tables = g?.tables ?? [];
  const isHost = !!g && me.id === g.hostId;
  const seatedIdx = tables.findIndex(t => t.a === me.id || t.b === me.id);
  const queued = !!g && (g.q8.includes(me.id) || g.q9.includes(me.id) || g.qAny.includes(me.id));
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
      if (!d.qAny.includes(p.id)) d.qAny.push(p.id); // default to Combined
    });
  }

  async function onAddMe(to: 'q8'|'q9'|'qAny') {
    if (!g) return;
    await save(d => {
      if (!d.players.some(p => p.id === me.id)) d.players.push(me);
      if (d.tables.some(t => t.a === me.id || t.b === me.id)) return;
      d.q8 = d.q8.filter(x => x !== me.id);
      d.q9 = d.q9.filter(x => x !== me.id);
      d.qAny = d.qAny.filter(x => x !== me.id);
      d[to].push(me.id);
    });
  }

  async function onRemovePlayer(pid: string) {
    await save(d => {
      d.players = d.players.filter(p => p.id !== pid);
      d.q8 = d.q8.filter(x => x !== pid);
      d.q9 = d.q9.filter(x => x !== pid);
      d.qAny = d.qAny.filter(x => x !== pid);
      d.tables.forEach(t => { if (t.a === pid) t.a = undefined; if (t.b === pid) t.b = undefined; });
    });
  }

  async function onRenamePlayer(pid: string) {
    const cur = players.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur); if (!nm) return;
    await save(d => { const p = d.players.find(pp => pp.id === pid); if (p) p.name = nm.trim() || p.name; });
  }

  async function onLeaveAllQueues(pid: string) {
    await save(d => {
      d.q8 = d.q8.filter(x => x !== pid);
      d.q9 = d.q9.filter(x => x !== pid);
      d.qAny = d.qAny.filter(x => x !== pid);
    });
  }

  // "Lost": remove from table & push to queue without reseating immediately
  async function onILost(pid?: string) {
    if (!g) return;
    const myId = pid ?? me.id;
    await save(d => {
      const idx = d.tables.findIndex(tt => tt.a === myId || tt.b === myId);
      if (idx < 0) return;
      const t = d.tables[idx];
      if (t.a === myId) t.a = undefined;
      if (t.b === myId) t.b = undefined;

      d.q8 = d.q8.filter(x => x !== myId);
      d.q9 = d.q9.filter(x => x !== myId);
      d.qAny = d.qAny.filter(x => x !== myId);

      if (d.lostToAny) d.qAny.push(myId);
      else (t.kind === 8 ? d.q8 : d.q9).push(myId);

      // prevent instant reseat of the same player in this cycle
      excludeSeatPidRef.current = myId;
    });
  }

  // ---------- Drag & Drop ----------
  type QKey = 'q8'|'q9'|'qAny';
  type DInfo =
    | { type: 'queue'; q: QKey; index: number; pid: string }
    | { type: 'queue-empty'; q: QKey }
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
        d.q8 = d.q8.filter(x => x !== pid);
        d.q9 = d.q9.filter(x => x !== pid);
        d.qAny = d.qAny.filter(x => x !== pid);
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
        const arr = d.players.map(p => p.id);
        const newIds = moveInArray(arr, movingPid, dst.type === 'players' ? dst.index : arr.length);
        d.players = newIds.map(id => d.players.find(p => p.id === id)!).filter(Boolean);
        return;
      }

      removeEverywhere(movingPid);

      if (dst.type === 'queue' || dst.type === 'queue-empty') {
        const qk = dst.q;
        if (dst.type === 'queue') d[qk] = moveInArray(d[qk], movingPid, dst.index);
        else d[qk].push(movingPid);
      } else if (dst.type === 'players' || dst.type === 'players-empty') {
        if (!d.players.some(p => p.id === movingPid)) d.players.push({ id: movingPid, name: 'Player' });
        const arr = d.players.map(p => p.id);
        const newIds = moveInArray(arr, movingPid, dst.type === 'players' ? dst.index : arr.length);
        d.players = newIds.map(id => d.players.find(p => p.id === id)!).filter(Boolean);
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
                  title="Drag from queues/players or swap seats"
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

      {/* ---------- QUEUES ---------- */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queues</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>
          <QueueColumn title="9-Foot Queue" items={g.q9} q="q9" nameOf={nameOf} onDragOver={onDragOver} onDrop={onDrop} onDragStart={onDragStart} />
          <QueueColumn title="8-Foot Queue" items={g.q8} q="q8" nameOf={nameOf} onDragOver={onDragOver} onDrop={onDrop} onDragStart={onDragStart} />
          <QueueColumn title="Combined Queue" items={g.qAny} q="qAny" nameOf={nameOf} onDragOver={onDragOver} onDrop={onDrop} onDragStart={onDragStart} />
        </div>
      </section>

      {/* ---------- LIST (PLAYERS) ---------- */}
      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{margin:'0 0 8px'}}>List (Players) — {playersCount}</h3>
          {isHost && (
            <div style={{display:'flex',gap:8}}>
              <input
                placeholder="Add player name..."
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
                style={input}
                disabled={busy}
              />
              <button style={btn} onClick={onAddPlayer} disabled={busy || !nameField.trim()}>Add</button>
            </div>
          )}
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
                title="Drag to reorder or move to a queue/table"
              >
                <span>{p.name}</span>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {isHost && <button style={btnMini} onClick={()=>onRenamePlayer(p.id)} disabled={busy}>Rename</button>}
                  {isHost && <button style={btnGhost} onClick={()=>onRemovePlayer(p.id)} disabled={busy}>Remove</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- INFO + JOIN + HOST CONTROLS ---------- */}
      <section style={notice}>
        <b>How it works:</b> Table-specific queues seat first (9-Foot → 9-foot table, 8-Foot → 8-foot table). The Combined Queue fills whichever table opens next. Drag names between Players, Queues, and Tables. Click <i>Lost</i> to rejoin a queue.
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
          {!seated && !queued && (
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button style={btn} onClick={()=>onAddMe('q9')} disabled={busy}>Join 9-Foot Queue</button>
              <button style={btn} onClick={()=>onAddMe('q8')} disabled={busy}>Join 8-Foot Queue</button>
              <button style={btnGhost} onClick={()=>onAddMe('qAny')} disabled={busy}>Join Combined</button>
            </div>
          )}
          {queued && <button style={btnGhost} onClick={()=>onLeaveAllQueues(me.id)} disabled={busy}>Leave queue(s)</button>}
          {seated && <button style={btnGhost} onClick={()=>onILost()} disabled={busy}>I lost</button>}
        </div>
      </header>

      {isHost && (
        <section style={card}>
          <h3 style={{marginTop:0}}>Host controls</h3>

          <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
            <label style={label}><input type="checkbox" checked={!!g.lostToAny} onChange={(e)=>save(d=>{d.lostToAny = e.currentTarget.checked;})} /> Send losers to Combined Queue</label>
            <div style={{flex:1}} />
            <button style={btnGhostSm} onClick={()=>setShowTModal(true)}>Create Tournament Mode…</button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>
            {g.tables.map((t, i) => (
              <div key={i} style={{background:'#111',border:'1px solid #333',borderRadius:10,padding:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:600,opacity:.9}}>Table {i+1} Settings</div>
                  <select
                    value={t.kind}
                    onChange={(e)=>save(d=>{ d.tables[i].kind = (e.currentTarget.value === '9' ? 9 : 8); })}
                    style={select}
                    disabled={busy}
                  >
                    <option value="9">9-Foot</option>
                    <option value="8">8-Foot</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <button
              style={btnGhostSm}
              onClick={()=>save(d=>{ if (d.tables.length < 2) d.tables.push({ kind: (d.tables[0]?.kind === 9 ? 8 : 9) }); })}
              disabled={busy || g.tables.length >= 2}
            >Add second table</button>
            <button
              style={btnGhostSm}
              onClick={()=>save(d=>{ if (d.tables.length > 1) d.tables = d.tables.slice(0,1); })}
              disabled={busy || g.tables.length <= 1}
            >Use one table</button>
          </div>
        </section>
      )}

      {/* ---------- TOURNAMENT CONFIG MODAL ---------- */}
      {showTModal && (
        <div style={modalWrap} onClick={()=>setShowTModal(false)}>
          <div style={modal} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{marginTop:0}}>Create Tournament Mode</h3>
            <div style={{display:'grid',gap:10}}>
              <label style={label}>Tables in use:
                <select value={tCount} onChange={(e)=>setTCount(e.currentTarget.value === '2' ? 2 : 1)} style={select}>
                  <option value="1">One table</option>
                  <option value="2">Two tables</option>
                </select>
              </label>
              <label style={label}>Table 1 type:
                <select value={t0Kind} onChange={(e)=>setT0Kind(e.currentTarget.value === '9' ? 9 : 8)} style={select}>
                  <option value="9">9-Foot</option>
                  <option value="8">8-Foot</option>
                </select>
              </label>
              {tCount === 2 && (
                <label style={label}>Table 2 type:
                  <select value={t1Kind} onChange={(e)=>setT1Kind(e.currentTarget.value === '9' ? 9 : 8)} style={select}>
                    <option value="9">9-Foot</option>
                    <option value="8">8-Foot</option>
                  </select>
                </label>
              )}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
              <button style={btnGhostSm} onClick={()=>setShowTModal(false)}>Cancel</button>
              <button
                style={btn}
                onClick={()=>{
                  localStorage.setItem('tournament_config', JSON.stringify({
                    listId: g.id,
                    players: g.players,
                    tables: tCount === 2 ? [t0Kind, t1Kind] : [t0Kind],
                  }));
                  setShowTModal(false);
                  alert('Tournament Mode config saved. Wire this to your /t route to proceed.');
                }}
              >Continue</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------- Small components ---------- */
function QueueColumn(props: {
  title: string;
  items: string[];
  q: 'q8'|'q9'|'qAny';
  nameOf: (id?: string)=>string;
  onDragStart: (e: React.DragEvent, info: any)=>void;
  onDragOver: (e: React.DragEvent)=>void;
  onDrop: (e: React.DragEvent, info: any)=>void;
}) {
  const { title, items, q, nameOf, onDragOver, onDrop, onDragStart } = props;
  return (
    <div
      style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,padding:12}}
      onDragOver={onDragOver}
      onDrop={(e)=>onDrop(e,{type:'queue-empty', q})}
    >
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <h4 style={{margin:'6px 0'}}>{title} ({items.length})</h4>
      </div>
      {items.length === 0 ? (
        <div style={{opacity:.6,fontStyle:'italic'}}>Drop players here</div>
      ) : (
        <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}>
          {items.map((pid, idx) => (
            <li
              key={`${pid}-${idx}`}
              draggable
              onDragStart={e=>onDragStart(e,{type:'queue', q, index: idx, pid})}
              onDragOver={onDragOver}
              onDrop={e=>onDrop(e,{type:'queue', q, index: idx, pid})}
              style={{cursor:'grab'}}
              title="Drag to reorder, move between queues, or seat on a table"
            >
              {nameOf(pid)}
            </li>
          ))}
        </ol>
      )}
    </div>
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
const label: React.CSSProperties = { display:'flex', gap:8, alignItems:'center' };
const select: React.CSSProperties = {
  background:'#111', border:'1px solid #333', color:'#fff', borderRadius:8, padding:'6px 8px'
};
const modalWrap: React.CSSProperties = {
  position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'grid', placeItems:'center', zIndex:50
};
const modal: React.CSSProperties = {
  background:'#101010', color:'#fff', border:'1px solid #2a2a2a', borderRadius:12, padding:16, width:'min(520px, 92vw)'
};
