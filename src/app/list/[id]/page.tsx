// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { uid } from '@/lib/storage';

/* ---------- Types (front-end) ---------- */
type Player = { id: string; name: string };
type Table = { a?: string; b?: string; kind: '8' | '9' };           // table size
type ListQueues = { any: string[]; q8: string[]; q9: string[] };    // three queues
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: 'active';
  createdAt: number; tables: Table[]; players: Player[]; queues: ListQueues; v?: number;
};

/* ---------- utilities ---------- */
const coerce = (x: any): ListGame | null => {
  if (!x) return null;
  try {
    const q: ListQueues = {
      any: Array.isArray(x.queues?.any) ? x.queues.any.map(String) : Array.isArray(x.queue) ? x.queue.map(String) : [],
      q8: Array.isArray(x.queues?.q8) ? x.queues.q8.map(String) : [],
      q9: Array.isArray(x.queues?.q9) ? x.queues.q9.map(String) : [],
    };
    const tables: Table[] = Array.isArray(x.tables)
      ? x.tables.map((t: any, i: number) => ({
          a: t?.a, b: t?.b,
          kind: t?.kind === '9' ? '9' : '8', // default 8′
        }))
      : [];
    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? 'Untitled'),
      code: x.code ? String(x.code) : undefined,
      hostId: String(x.hostId ?? ''),
      status: 'active',
      createdAt: Number(x.createdAt ?? Date.now()),
      players: Array.isArray(x.players) ? x.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') })) : [],
      tables,
      queues: q,
      v: Number(x.v ?? 0),
    };
  } catch {
    return null;
  }
};

function findName(players: Player[], id?: string) {
  if (!id) return '—';
  return players.find(p => p.id === id)?.name || '??';
}

/* --------- page --------- */
export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [pref, setPref] = useState<'any' | 'q8' | 'q9'>('any'); // user preference when joining

  // id from URL
  const id =
    typeof window !== 'undefined'
      ? decodeURIComponent(window.location.pathname.split('/').pop() || '')
      : '';

  /* me */
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

  /* alerts */
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

  /* seat-change detector (for alerts) */
  const lastSeating = useRef<string>('');
  function detectMySeatingChanged(next: ListGame | null) {
    if (!next) return false;
    const i = next.tables.findIndex(t => t.a === me.id || t.b === me.id);
    if (i < 0) {
      if (lastSeating.current !== '') { lastSeating.current = ''; return true; }
      return false;
    }
    const t = next.tables[i];
    const key = `table-${i}-${t.a ?? 'x'}-${t.b ?? 'x'}`;
    if (key !== lastSeating.current) { lastSeating.current = key; return true; }
    return false;
  }

  /* --------------- data I/O --------------- */
  async function getOnce() {
    const res = await fetch(`/api/list/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('load-failed');
    const json = await res.json();
    const doc = coerce(json);
    setG(doc);
    if (detectMySeatingChanged(doc)) bumpAlerts();
    return { doc, etag: res.headers.get('etag') };
  }

  async function put(doc: ListGame, ifMatch?: string | null) {
    const res = await fetch(`/api/list/${encodeURIComponent(doc.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(ifMatch ? { 'if-match': ifMatch.replace(/(^"|"$)/g, '') } : {}),
      },
      body: JSON.stringify(doc),
    });
    if (!res.ok && res.status !== 204) {
      const msg = await res.text().catch(()=>'');
      throw new Error(`save-failed ${res.status} ${msg}`);
    }
    return res.headers.get('etag');
  }

  // smart poll via If-None-Match (uses the helper in your project)
  useEffect(() => {
    if (!id) return;
    let stop = false;
    let etag: string | null = null;
    let timer: any;

    const minMs = 4000, maxMs = 60000;
    let interval = minMs;

    async function tick(force = false) {
      if (stop) return;
      try {
        const res = await fetch(`/api/list/${encodeURIComponent(id)}`, {
          cache: 'no-store',
          headers: etag ? { 'If-None-Match': etag } : {},
        });
        if (res.status === 200) {
          etag = res.headers.get('etag');
          const json = await res.json();
          const doc = coerce(json);
          if (doc?.id) {
            setG(doc);
            if (detectMySeatingChanged(doc)) bumpAlerts();
          }
          interval = Math.max(minMs, Math.round(interval * 0.6));
        } else if (res.status === 304) {
          interval = Math.min(maxMs, Math.round(interval * 1.35));
        } else {
          interval = Math.min(maxMs, Math.round(interval * 1.5));
        }
      } catch {
        interval = Math.min(maxMs, Math.round(interval * 1.6));
      } finally {
        if (!stop) timer = setTimeout(() => tick(), force ? minMs : interval);
      }
    }

    tick(true);
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [id]);

  /* --------------- seating logic --------------- */

  // returns updated doc if a seat was filled, else null
  function seatFromQueues(doc: ListGame): ListGame | null {
    const next = structuredClone(doc) as ListGame;

    // helper to pop from array by id
    const popFrom = (arr: string[], id: string) => {
      const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1);
    };

    // try to fill any empty seat
    let changed = false;
    for (let i = 0; i < next.tables.length; i++) {
      const t = next.tables[i];
      const need = !t.a || !t.b;
      if (!need) continue;

      const want = t.kind === '9' ? 'q9' : 'q8';
      const source = [next.queues.any, next.queues[want], want === 'q9' ? next.queues.q8 : next.queues.q9];

      for (const q of source) {
        const pid = q[0];
        if (!pid) continue;
        // verify pid still exists
        if (!next.players.some(p => p.id === pid)) { q.shift(); continue; }

        if (!t.a) { t.a = pid; popFrom(next.queues.any, pid); popFrom(next.queues.q8, pid); popFrom(next.queues.q9, pid); changed = true; break; }
        if (!t.b) { t.b = pid; popFrom(next.queues.any, pid); popFrom(next.queues.q8, pid); popFrom(next.queues.q9, pid); changed = true; break; }
      }
    }
    return changed ? next : null;
  }

  async function saveWithAutoSeat(mut?: (x: ListGame)=>void) {
    if (!g) return;
    setBusy(true);
    try {
      const { doc: latest, etag } = await getOnce();
      if (!latest) throw new Error('no-doc');
      let next = structuredClone(latest) as ListGame;
      if (mut) mut(next);
      // always try to auto seat
      const seated = seatFromQueues(next);
      if (seated) next = seated;
      const newTag = await put(next, etag);
      setG(next);
      bumpAlerts();
      return newTag;
    } catch (e) {
      alert('Could not save.');
    } finally {
      setBusy(false);
    }
  }

  /* --------------- actions --------------- */

  async function onJoinQueue(which: 'any'|'q8'|'q9') {
    if (!g || busy) return;
    await saveWithAutoSeat(x => {
      // ensure player exists
      if (!x.players.some(p => p.id === me.id)) x.players.push({ id: me.id, name: me.name });
      // if already seated or in any queue, ignore
      const seated = x.tables.some(t => t.a === me.id || t.b === me.id);
      if (seated) return;
      if (!x.queues.any.includes(me.id) && !x.queues.q8.includes(me.id) && !x.queues.q9.includes(me.id)) {
        x.queues[which].push(me.id);
      }
    });
  }

  async function onAddPlayerManual() {
    if (!g || busy) return;
    const nm = nameField.trim(); if (!nm) return;
    await saveWithAutoSeat(x => {
      const p: Player = { id: uid(), name: nm };
      x.players.push(p);
      // new players default to first-available
      if (!x.queues.any.includes(p.id)) x.queues.any.push(p.id);
    });
    setNameField('');
  }

  async function onRemovePlayer(pid: string) {
    if (!g || busy) return;
    await saveWithAutoSeat(x => {
      x.players = x.players.filter(p => p.id !== pid);
      ['any','q8','q9'].forEach((k) => {
        // @ts-ignore
        x.queues[k] = x.queues[k].filter((id:string)=>id!==pid);
      });
      x.tables.forEach(t => {
        if (t.a === pid) t.a = undefined;
        if (t.b === pid) t.b = undefined;
      });
    });
  }

  async function onSendToQueue(pid: string, which: 'any'|'q8'|'q9') {
    if (!g || busy) return;
    await saveWithAutoSeat(x => {
      ['any','q8','q9'].forEach((k) => {
        // @ts-ignore
        x.queues[k] = x.queues[k].filter((id:string)=>id!==pid);
      });
      // if already seated, unseat first slot they occupy
      const table = x.tables.find(t => t.a === pid || t.b === pid);
      if (table) { if (table.a === pid) table.a = undefined; else table.b = undefined; }
      x.queues[which].push(pid);
    });
  }

  async function onRename(pid: string) {
    if (!g || busy) return;
    const cur = g.players.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    await saveWithAutoSeat(x => {
      const p = x.players.find(pp=>pp.id===pid);
      if (p) p.name = nm.trim() || p.name;
    });
  }

  async function onILost() {
    if (!g || busy) return;
    await saveWithAutoSeat(x => {
      const t = x.tables.find(tt => tt.a === me.id || tt.b === me.id);
      if (!t) return;
      if (t.a === me.id) t.a = undefined;
      if (t.b === me.id) t.b = undefined;
      // after a loss, send me to first-available queue again
      if (!x.queues.any.includes(me.id)) x.queues.any.push(me.id);
    });
    alert("It's ok — we put you back in First-available. 💪");
  }

  async function onTables(count: 1 | 2) {
    if (!g || busy) return;
    await saveWithAutoSeat(x => {
      if (count === 1) x.tables = [x.tables[0] ?? { kind:'8' }];
      else x.tables = [
        x.tables[0] ?? { kind:'8' },
        x.tables[1] ?? { kind:'9' },
      ];
    });
  }

  async function onSetKind(i: number, kind: '8'|'9') {
    if (!g || busy) return;
    await saveWithAutoSeat(x => {
      if (!x.tables[i]) x.tables[i] = { kind };
      x.tables[i].kind = kind;
    });
  }

  // Drag & drop between queues and seats
  type DInfo =
    | { type:'queue'; q:'any'|'q8'|'q9'; pid:string }
    | { type:'seat'; table:number; side:'a'|'b'; pid?:string };

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

    await saveWithAutoSeat(x => {
      // normalize: remove src pid from where it is
      const pid = src.type === 'queue' ? src.pid : src.pid!;
      ['any','q8','q9'].forEach((k)=>{ // @ts-ignore
        x.queues[k] = x.queues[k].filter((id:string)=>id!==pid);
      });
      x.tables.forEach(t => { if (t.a === pid) t.a = undefined; if (t.b === pid) t.b = undefined; });

      // place to destination
      if (dst.type === 'queue') {
        x.queues[dst.q].push(pid);
      } else {
        const t = x.tables[dst.table];
        if (dst.side === 'a') t.a = pid; else t.b = pid;
      }
    });
  }

  /* --------------- render --------------- */

  if (!g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <p style={{ opacity:.7 }}>Loading…</p>
        <div><button style={btnGhostSm} onClick={()=>getOnce()}>Retry</button></div>
      </main>
    );
  }

  const isHost = g.hostId === me.id;
  const seatedHere = g.tables.findIndex(t => t.a === me.id || t.b === me.id) >= 0;

  const players = g.players;
  const qAny = g.queues.any, q8 = g.queues.q8, q9 = g.queues.q9;

  return (
    <main style={wrap}>
      {/* top bar */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/lists" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pill}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={()=>getOnce()}>Refresh</button>
        </div>
      </div>

      {/* instructions */}
      <section style={notice}>
        <b>How it works:</b> Choose 1 or 2 tables and set each to <b>8′</b> or <b>9′</b>.
        Players can join <i>First-available</i> (auto seats into any empty table) or a specific table queue.
        When a seat opens or a player joins and a table is empty, they’re seated automatically.
        While seated, a player can tap <i>I lost</i> to free the seat and rejoin First-available.
      </section>

      {/* header + my actions */}
      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input defaultValue={g.name} onBlur={(e)=> e.target.value.trim() && saveWithAutoSeat(x=>{ x.name = e.target.value.trim(); })} style={nameInput} disabled={busy}/>
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Private code: <b>{g.code || '—'}</b>
          </div>
        </div>

        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {!seatedHere && (
            <>
              <select value={pref} onChange={e=>setPref(e.target.value as any)} style={select} disabled={busy}>
                <option value="any">First-available</option>
                <option value="q8">Queue 8′</option>
                <option value="q9">Queue 9′</option>
              </select>
              <button style={btn} onClick={()=>onJoinQueue(pref)} disabled={busy}>Join</button>
            </>
          )}
          {seatedHere && (
            <button style={btnGhost} onClick={onILost} disabled={busy}>I lost</button>
          )}
        </div>
      </header>

      {/* host controls */}
      {isHost && (
        <section style={card}>
          <h3 style={{marginTop:0}}>Host controls</h3>

          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
            <button style={g.tables.length===1 ? btnActive : btnGhost} onClick={()=>onTables(1)} disabled={busy}>1 Table</button>
            <button style={g.tables.length===2 ? btnActive : btnGhost} onClick={()=>onTables(2)} disabled={busy}>2 Tables</button>
          </div>

          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:12}}>
            {g.tables.map((t, i) => (
              <div key={i} style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{opacity:.8}}>Table {i+1}</span>
                <button style={t.kind==='8'? btnActive : btnGhostSm} onClick={()=>onSetKind(i,'8')} disabled={busy}>8′</button>
                <button style={t.kind==='9'? btnActive : btnGhostSm} onClick={()=>onSetKind(i,'9')} disabled={busy}>9′</button>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
            <input placeholder="Add player name..." value={nameField} onChange={(e)=>setNameField(e.target.value)} style={input} disabled={busy}/>
            <button style={btn} onClick={onAddPlayerManual} disabled={busy || !nameField.trim()}>Add player</button>
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
                      <button style={btnMini} onClick={()=>onRename(p.id)} disabled={busy}>Rename</button>
                      <button style={btnMini} onClick={()=>onSendToQueue(p.id,'any')} disabled={busy}>Send ↗ First-avail</button>
                      <button style={btnMini} onClick={()=>onSendToQueue(p.id,'q8')} disabled={busy}>Send ↗ 8′</button>
                      <button style={btnMini} onClick={()=>onSendToQueue(p.id,'q9')} disabled={busy}>Send ↗ 9′</button>
                      <button style={btnGhost} onClick={()=>onRemovePlayer(p.id)} disabled={busy}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Queues */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Queues</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12}}>
          {[
            { key:'any' as const, title:'First-available', data:qAny },
            { key:'q8'  as const, title:'Queue 8′',         data:q8  },
            { key:'q9'  as const, title:'Queue 9′',         data:q9  },
          ].map((q) => (
            <div key={q.key} style={{background:'#111',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:'10px 12px'}}
                 onDragOver={onDragOver}
                 onDrop={(e)=>onDrop(e,{type:'queue', q:q.key, pid:''})}>
              <div style={{opacity:.8,fontSize:12,marginBottom:6}}>{q.title} ({q.data.length})</div>
              {q.data.length===0 ? <div style={{opacity:.7}}>No one waiting.</div> : (
                <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}>
                  {q.data.map(pid => (
                    <li key={pid}
                        draggable
                        onDragStart={e=>onDragStart(e,{type:'queue', q:q.key, pid})}
                        style={{cursor:'grab'}}>
                      {findName(players,pid)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Tables (blue) */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Tables</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:12}}>
          {g.tables.map((t, i) => {
            const aName = findName(players, t.a);
            const bName = findName(players, t.b);
            const meHere = t.a === me.id || t.b === me.id;

            const Seat = ({ side }: { side:'a'|'b' }) => {
              const pid = t[side];
              const info = { type:'seat' as const, table:i, side, pid };
              return (
                <div
                  draggable={!!pid}
                  onDragStart={e=> pid && onDragStart(e, info)}
                  onDragOver={onDragOver}
                  onDrop={e=>onDrop(e, info)}
                  style={{minHeight:22, padding:'6px 8px', border:'1px dashed rgba(255,255,255,.25)', borderRadius:8}}
                  title="Drag from queues or the other seat"
                >
                  {side==='a' ? aName : bName}
                </div>
              );
            };

            return (
              <div key={i} style={{ background:'#0b3a66', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(56,189,248,.35)'}}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ opacity:.9, fontSize:12 }}>Table {i+1} • {t.kind === '9' ? '9′' : '8′'}</div>
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

/* ------------ styles ------------ */
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
const pill: React.CSSProperties = {
  padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)',
  border:'1px solid rgba(16,185,129,.35)', fontSize:12
};
const btn: React.CSSProperties = {
  padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9',
  color:'#fff', fontWeight:700, cursor:'pointer'
};
const btnGhost: React.CSSProperties = {
  padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)',
  background:'transparent', color:'#fff', cursor:'pointer'
};
const btnActive: React.CSSProperties = {
  padding:'6px 10px', borderRadius:10, border:'none', background:'#0ea5e9',
  color:'#fff', fontWeight:700, cursor:'pointer'
};
const btnGhostSm: React.CSSProperties = {
  padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)',
  background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600
};
const btnMini: React.CSSProperties = {
  padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)',
  background:'transparent', color:'#fff', cursor:'pointer', fontSize:12
};
const input: React.CSSProperties = {
  width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10,
  border:'1px solid #333', background:'#111', color:'#fff'
};
const select: React.CSSProperties = {
  padding:'8px 10px', borderRadius:10, border:'1px solid #333',
  background:'#111', color:'#fff', minWidth:150
};
const nameInput: React.CSSProperties = {
  background:'#111', border:'1px solid #333', color:'#fff',
  borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)'
};
