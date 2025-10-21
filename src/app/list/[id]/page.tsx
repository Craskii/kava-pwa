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
type Table = { a?: string; b?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: 'active';
  createdAt: number; tables: Table[]; players: Player[]; queue: string[]; v?: number;
};

function coerce(x: any): ListGame | null {
  if (!x) return null;
  try {
    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? 'Untitled'),
      code: x?.code ? String(x.code) : undefined,
      hostId: String(x.hostId ?? ''),
      status: 'active',
      createdAt: Number(x.createdAt ?? Date.now()),
      tables: Array.isArray(x.tables)
        ? x.tables.map((t: any) => ({ a: t?.a, b: t?.b }))
        : [{}, {}],
      players: Array.isArray(x.players)
        ? x.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') }))
        : [],
      queue: Array.isArray(x.queue) ? x.queue.map((id: any) => String(id)) : [],
      v: Number(x.v ?? 0),
    };
  } catch { return null; }
}

export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');

  // numeric version used for If-Match
  const verRef = useRef<string | null>(null);
  // keep last seating signature so we can ping alerts when my seat changes
  const lastSeatSig = useRef<string>('');

  // ID from URL
  const id =
    typeof window !== 'undefined'
      ? decodeURIComponent(window.location.pathname.split('/').pop() || '')
      : '';

  // me
  const me = useMemo<Player>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('kava_me') || 'null') || {
          id: uid(), name: 'Player'
        }
      );
    } catch {
      return { id: uid(), name: 'Player' };
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('kava_me', JSON.stringify(me));
  }, [me]);

  // alerts
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
    const sig = `t${idx}-${t.a ?? 'x'}-${t.b ?? 'x'}`;
    if (sig !== lastSeatSig.current) { lastSeatSig.current = sig; return true; }
    return false;
  }

  /* ------------------- GET/PUT helpers ------------------- */

  async function getOnce() {
    if (!id) return null;
    const res = await fetch(`/api/list/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('load-failed');
    const json = await res.json();
    const doc = coerce(json);
    verRef.current = res.headers.get('x-l-version'); // capture numeric version
    return doc;
  }

  async function putDoc(next: ListGame) {
    const res = await fetch(`/api/list/${encodeURIComponent(next.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(verRef.current ? { 'if-match': verRef.current } : {}),
      },
      body: JSON.stringify(next),
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`save-failed-${res.status}`);
    }
    const v = res.headers.get('x-l-version');
    if (v) verRef.current = v;
  }

  // auto-seat: fill empty seats from the single queue (front of the line)
  function autoSeat(doc: ListGame): ListGame {
    const next = structuredClone(doc) as ListGame;
    const take = () => {
      while (next.queue.length > 0) {
        const pid = next.queue[0];
        // ensure player still exists
        if (!next.players.some(p => p.id === pid)) {
          next.queue.shift(); continue;
        }
        return next.queue.shift()!;
      }
      return undefined;
    };
    let changed = false;
    for (const t of next.tables) {
      if (!t.a) { const pid = take(); if (pid) { t.a = pid; changed = true; } }
      if (!t.b) { const pid = take(); if (pid) { t.b = pid; changed = true; } }
    }
    return changed ? next : doc;
  }

  async function save(mut: (x: ListGame) => void) {
    if (!g || busy) return;
    setBusy(true);
    try {
      // always re-read latest (and its version) to reduce 412s
      const latest = await getOnce();
      if (!latest) throw new Error('no-latest');
      let next = structuredClone(latest) as ListGame;
      mut(next);
      next = autoSeat(next);
      await putDoc(next);
      setG(next);
      if (detectSeatChange(next)) bumpAlerts();
    } catch {
      // one retry path on conflict: refetch, reapply, save
      try {
        const latest2 = await getOnce();
        if (!latest2) throw new Error('no-latest-2');
        let next2 = structuredClone(latest2) as ListGame;
        mut(next2);
        next2 = autoSeat(next2);
        await putDoc(next2);
        setG(next2);
        if (detectSeatChange(next2)) bumpAlerts();
      } catch {
        alert('Could not change.');
      }
    } finally {
      setBusy(false);
    }
  }

  /* ------------------- Polling ------------------- */
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

  /* ------------------- Derived ------------------- */
  const players = g?.players ?? [];
  const queue = g?.queue ?? [];
  const tables = g?.tables ?? [];
  const isHost = !!g && me.id === g.hostId;
  const seatedIdx = tables.findIndex(t => t.a === me.id || t.b === me.id);
  const queued = queue.includes(me.id);
  const seated = seatedIdx >= 0;

  function nameOf(id?: string) {
    if (!id) return '—';
    return players.find(p => p.id === id)?.name || '??';
  }

  /* ------------------- Actions ------------------- */

  async function refreshOnce() {
    try {
      setBusy(true);
      const doc = await getOnce();
      if (doc) setG(doc);
    } catch {} finally { setBusy(false); }
  }

  async function onRenameList(newName: string) {
    const v = newName.trim();
    if (!g || !v) return;
    await save(d => { d.name = v; });
  }

  async function onAddPlayer() {
    if (!g || !nameField.trim()) return;
    const nm = nameField.trim();
    setNameField('');
    await save(d => {
      const p = { id: uid(), name: nm };
      d.players.push(p);
      // default: also join queue
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
      d.tables.forEach(t => {
        if (t.a === pid) t.a = undefined;
        if (t.b === pid) t.b = undefined;
      });
    });
  }

  async function onRenamePlayer(pid: string) {
    const cur = players.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    await save(d => {
      const p = d.players.find(pp => pp.id === pid);
      if (p) p.name = nm.trim() || p.name;
    });
  }

  async function onJoinQueue() {
    if (!g) return;
    await save(d => {
      if (!d.players.some(p => p.id === me.id)) d.players.push(me);
      if (d.tables.some(t => t.a === me.id || t.b === me.id)) return;
      if (!d.queue.includes(me.id)) d.queue.push(me.id);
    });
  }

  async function onLeaveQueue() {
    if (!g) return;
    await save(d => {
      d.queue = d.queue.filter(x => x !== me.id);
    });
  }

  async function onILost() {
    if (!g) return;
    await save(d => {
      const t = d.tables.find(tt => tt.a === me.id || tt.b === me.id);
      if (!t) return;
      if (t.a === me.id) t.a = undefined;
      if (t.b === me.id) t.b = undefined;
      if (!d.queue.includes(me.id)) d.queue.push(me.id);
    });
    alert("It's ok — you can hop back in the queue.");
  }

  // DnD between queue and seats (simple)
  type DInfo =
    | { type: 'queue'; pid: string }
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

      let movingPid: string | undefined;
      if (src.type === 'queue') movingPid = src.pid;
      if (src.type === 'seat') movingPid = d.tables[src.table][src.side];

      if (!movingPid) return;

      removeEverywhere(movingPid);

      if (dst.type === 'queue') {
        if (!d.queue.includes(movingPid)) d.queue.push(movingPid);
      } else {
        const t = d.tables[dst.table];
        if (dst.side === 'a') t.a = movingPid; else t.b = movingPid;
      }
    });
  }

  /* ------------------- Render ------------------- */

  if (!g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <p style={{ opacity: .7 }}>Loading…</p>
        <div><button style={btnGhostSm} onClick={refreshOnce} disabled={busy}>Retry</button></div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      {/* top bar */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/lists" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={refreshOnce} disabled={busy}>Refresh</button>
        </div>
      </div>

      {/* instructions */}
      <section style={notice}>
        <b>How it works:</b> One shared queue feeds both tables. When a seat opens or a player joins and a table is empty, they’re seated automatically. While seated, tap <i>I lost</i> to free the seat and rejoin the queue.
      </section>

      {/* header + my actions */}
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
            Private code: <b>{g.code || '—'}</b> • {players.length} {players.length === 1 ? 'player' : 'players'}
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {!seated && !queued && <button style={btn} onClick={onJoinQueue} disabled={busy}>Join queue</button>}
          {queued && <button style={btnGhost} onClick={onLeaveQueue} disabled={busy}>Leave queue</button>}
          {seated && <button style={btnGhost} onClick={onILost} disabled={busy}>I lost</button>}
        </div>
      </header>

      {/* Host controls */}
      {isHost && (
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
            <button style={btn} onClick={onAddPlayer} disabled={busy || !nameField.trim()}>Add player</button>
            <button style={btnGhost} onClick={onAddMe} disabled={busy}>Add me</button>
          </div>

          <div>
            <h4 style={{ margin:'6px 0' }}>Players ({players.length})</h4>
            {players.length === 0 ? (
              <div style={{ opacity:.7 }}>No players yet.</div>
            ) : (
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
                {players.map((p) => (
                  <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                    <span>{p.name}</span>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button style={btnMini} onClick={()=>onRenamePlayer(p.id)} disabled={busy}>Rename</button>
                      <button style={btnGhost} onClick={()=>onRemovePlayer(p.id)} disabled={busy}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Queue */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
        {queue.length === 0 ? (
          <div style={{ opacity:.7 }}>No one waiting.</div>
        ) : (
          <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}>
            {queue.map(pid => (
              <li
                key={pid}
                draggable
                onDragStart={e=>onDragStart(e,{type:'queue', pid})}
                style={{cursor:'grab'}}
              >
                {nameOf(pid)}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Tables (blue) */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Tables</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', gap:12}}>
          {tables.map((t, i) => {
            const meHere = t.a === me.id || t.b === me.id;
            const Seat = ({ side }: { side:'a'|'b' }) => {
              const pid = t[side];
              const info: DInfo = { type:'seat', table:i, side, pid };
              return (
                <div
                  draggable={!!pid}
                  onDragStart={(e)=> pid && onDragStart(e, info)}
                  onDragOver={onDragOver}
                  onDrop={(e)=>onDrop(e, info)}
                  style={{minHeight:24, padding:'8px 10px', border:'1px dashed rgba(255,255,255,.25)', borderRadius:8, background:'rgba(56,189,248,.10)'}}
                  title="Drag from queue or the other seat"
                >
                  {nameOf(pid)}
                </div>
              );
            };
            return (
              <div key={i} style={{ background:'#0b3a66', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(56,189,248,.35)'}}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ opacity:.9, fontSize:12 }}>Table {i+1}</div>
                  {meHere && <button style={btnMini} onClick={onILost} disabled={busy}>I lost</button>}
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
