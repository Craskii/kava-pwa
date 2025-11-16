// src/app/local-list/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

/* ============ Types ============ */
type TableLabel = '8 foot' | '9 foot';
type Table = { a?: string; b?: string; label: TableLabel };
type Player = { id: string; name: string };
type Pref = '8 foot' | '9 foot' | 'any';
type AuditEntry = { t: number; who?: string; type: string; note?: string };

type ListGame = {
  id: string;
  name: string;
  hostId: string;
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];
  prefs: Record<string, Pref>;
  cohosts: string[];
  audit: AuditEntry[];
  v: number;
  schema: 'local-v1';
};

/* ============ Local storage helpers ============ */
const LS_KEY = 'kava_local_list_v1';

function loadLocal(): ListGame {
  if (typeof window === 'undefined') {
    return {
      id: 'local',
      name: 'Local List',
      hostId: '',
      createdAt: Date.now(),
      tables: [{ label: '8 foot' }, { label: '9 foot' }],
      players: [],
      queue: [],
      prefs: {},
      cohosts: [],
      audit: [],
      v: 0,
      schema: 'local-v1',
    };
  }

  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (raw && raw.schema === 'local-v1') {
      const players: Player[] = Array.isArray(raw.players) ? raw.players : [];
      const prefs: Record<string, Pref> = raw.prefs || {};
      for (const p of players) if (!prefs[p.id]) prefs[p.id] = 'any';

      const tables: Table[] =
        Array.isArray(raw.tables) && raw.tables.length
          ? raw.tables.map((t: any, i: number) => ({
              a: t?.a,
              b: t?.b,
              label:
                t?.label === '9 foot' || t?.label === '8 foot'
                  ? t.label
                  : (i === 1 ? '9 foot' : '8 foot') as TableLabel,
            }))
          : [{ label: '8 foot' }, { label: '9 foot' }];

      return {
        id: 'local',
        name: String(raw.name || 'Local List'),
        hostId: String(raw.hostId || ''),
        createdAt: Number(raw.createdAt || Date.now()),
        tables,
        players,
        queue: Array.isArray(raw.queue) ? raw.queue.filter(Boolean) : [],
        prefs,
        cohosts: Array.isArray(raw.cohosts) ? raw.cohosts : [],
        audit: Array.isArray(raw.audit) ? raw.audit.slice(-100) : [],
        v: Number.isFinite(raw.v) ? Number(raw.v) : 0,
        schema: 'local-v1',
      };
    }
  } catch {}
  
  return {
    id: 'local',
    name: 'Local List',
    hostId: '',
    createdAt: Date.now(),
    tables: [{ label: '8 foot' }, { label: '9 foot' }],
    players: [],
    queue: [],
    prefs: {},
    cohosts: [],
    audit: [],
    v: 0,
    schema: 'local-v1',
  };
}

const saveLocal = (doc: ListGame) => {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch {}
};

/* ============ Component ============ */
export default function LocalListPage() {
  const me = useMemo<Player>(() => {
    if (typeof window === 'undefined') return { id: '', name: 'Player' };
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Player' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);
  
  useEffect(() => { 
    if (typeof window !== 'undefined') {
      localStorage.setItem('kava_me', JSON.stringify(me)); 
    }
  }, [me]);

  const [g, setG] = useState<ListGame>(() => {
    const doc = loadLocal();
    if (!doc.hostId && me.id) { 
      doc.hostId = me.id; 
      saveLocal(doc); 
    }
    return doc;
  });

  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [showTableControls, setShowTableControls] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [supportsDnD, setSupportsDnD] = useState<boolean>(false);
  const [lostMessage, setLostMessage] = useState<string | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => { 
    setSupportsDnD(!('ontouchstart' in window)); 
  }, []);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = (doc: ListGame) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { saveLocal(doc); }, 120);
  };

  const iAmHost = me.id === g.hostId;
  const iAmCohost = (g.cohosts ?? []).includes(me.id);
  const iHaveMod = iAmHost || iAmCohost;
  const queue = g.queue ?? [];
  const players = g.players;
  const prefs = g.prefs || {};
  const nameOf = (pid?: string) => (pid ? players.find(p => p.id === pid)?.name || '??' : '—');
  const inQueue = (pid: string) => queue.includes(pid);

  useEffect(() => {
    const root = pageRootRef.current;
    if (!root) return;
    const prevent = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
    };
    root.addEventListener('contextmenu', prevent);
    return () => { root.removeEventListener('contextmenu', prevent); };
  }, []);

  const excludeSeatPidRef = useRef<string | null>(null);
  
  function autoSeat(next: ListGame) {
    const excluded = excludeSeatPidRef.current;
    const pmap = next.prefs || {};

    const takeFromQueue = (want: TableLabel) => {
      for (let i = 0; i < next.queue.length; i++) {
        const pid = next.queue[i];
        if (!pid) { next.queue.splice(i, 1); i--; continue; }
        if (excluded && pid === excluded) continue;
        const pref = (pmap[pid] ?? 'any') as Pref;
        if (pref === 'any' || pref === want) { next.queue.splice(i, 1); return pid; }
      }
      return undefined;
    };

    const fillFromPlayersIfNoQueue = next.queue.length === 0;
    const seatedSet = new Set<string>();
    for (const t of next.tables) { if (t.a) seatedSet.add(t.a); if (t.b) seatedSet.add(t.b); }
    const candidates = fillFromPlayersIfNoQueue
      ? next.players.map(p => p.id).filter(pid => !seatedSet.has(pid))
      : [];

    const takeFromPlayers = (want: TableLabel) => {
      for (let i = 0; i < candidates.length; i++) {
        const pid = candidates[i];
        const pref = (pmap[pid] ?? 'any') as Pref;
        if (pid !== excluded && (pref === 'any' || pref === want)) { candidates.splice(i, 1); return pid; }
      }
      return undefined;
    };

    next.tables.forEach((t) => {
      if (!t.a) t.a = takeFromQueue(t.label) ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined);
      if (!t.b) t.b = takeFromQueue(t.label) ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined);
    });

    excludeSeatPidRef.current = null;
  }

  function update(mut: (d: ListGame) => void, audit?: AuditEntry) {
    setBusy(true);
    setG(prev => {
      const d: ListGame = JSON.parse(JSON.stringify(prev));
      d.v = (d.v || 0) + 1;
      mut(d);
      autoSeat(d);
      if (audit) d.audit.push(audit);
      persist(d);
      return d;
    });
    setTimeout(() => setBusy(false), 80);
  }

  const renameList = (nm: string) => {
    const v = nm.trim(); if (!v) return;
    update(d => { d.name = v; }, { t: Date.now(), who: me.id, type: 'rename', note: v });
  };
  
  const ensureMe = (d: ListGame) => {
    if (!d.players.some(p => p.id === me.id)) d.players.push(me);
    if (!d.prefs[me.id]) d.prefs[me.id] = 'any';
  };
  
  const joinQueue = () => update(d => { 
    ensureMe(d); 
    if (!d.queue.includes(me.id)) d.queue.push(me.id); 
  }, { t: Date.now(), who: me.id, type: 'join-queue' });
  
  const leaveQueue = () => update(d => { 
    d.queue = d.queue.filter(x => x !== me.id); 
  }, { t: Date.now(), who: me.id, type: 'leave-queue' });
  
  const addPlayer = () => {
    const v = nameField.trim(); if (!v) return;
    const p: Player = { id: uid(), name: v };
    setNameField('');
    update(d => {
      d.players.push(p);
      d.prefs[p.id] = 'any';
      if (!d.queue.includes(p.id)) d.queue.push(p.id);
    }, { t: Date.now(), who: me.id, type: 'add-player', note: v });
  };
  
  const removePlayer = (pid: string) => update(d => {
    d.players = d.players.filter(p => p.id !== pid);
    d.queue = d.queue.filter(x => x !== pid);
    delete d.prefs[pid];
    d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b }));
  }, { t: Date.now(), who: me.id, type: 'remove-player', note: nameOf(pid) });
  
  const renamePlayer = (pid: string) => {
    const cur = players.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    const v = nm.trim(); if (!v) return;
    update(d => { const p = d.players.find(pp => pp.id === pid); if (p) p.name = v; }, { t: Date.now(), who: me.id, type: 'rename-player', note: v });
  };
  
  const setPrefFor = (pid: string, pref: Pref) => update(d => { 
    d.prefs[pid] = pref; 
  }, { t: Date.now(), who: me.id, type: 'set-pref', note: `${nameOf(pid)} → ${pref}` });
  
  const enqueuePid = (pid: string) => update(d => { 
    if (!d.queue.includes(pid)) d.queue.push(pid); 
  }, { t: Date.now(), who: me.id, type: 'queue', note: nameOf(pid) });
  
  const dequeuePid = (pid: string) => update(d => { 
    d.queue = d.queue.filter(x => x !== pid); 
  }, { t: Date.now(), who: me.id, type: 'dequeue', note: nameOf(pid) });

  const leaveList = () => update(d => {
    d.players = d.players.filter(p => p.id !== me.id);
    d.queue = d.queue.filter(x => x !== me.id);
    d.tables = d.tables.map(t => ({ ...t, a: t.a === me.id ? undefined : t.a, b: t.b === me.id ? undefined : t.b }));
    delete d.prefs[me.id];
  }, { t: Date.now(), who: me.id, type: 'leave-list' });

  const toggleCohost = (pid: string) => update(d => {
    const has = d.cohosts.includes(pid);
    d.cohosts = has ? d.cohosts.filter(x => x !== pid) : [...d.cohosts, pid];
  }, { t: Date.now(), who: me.id, type: 'toggle-cohost', note: nameOf(pid) });

  const moveUp = (index: number) => update(d => {
    if (index <= 0 || index >= d.queue.length) return;
    const a = d.queue[index - 1]; d.queue[index - 1] = d.queue[index]; d.queue[index] = a;
  });
  
  const moveDown = (index: number) => update(d => {
    if (index < 0 || index >= d.queue.length - 1) return;
    const a = d.queue[index + 1]; d.queue[index + 1] = d.queue[index]; d.queue[index] = a;
  });
  
  const skipFirst = () => update(d => {
    if (d.queue.length >= 2) { 
      const first = d.queue.shift()!; 
      const second = d.queue.shift()!; 
      d.queue.unshift(first, second); 
    }
  }, { t: Date.now(), who: me.id, type: 'skip-first' });

  const iLost = (pid?: string) => {
    const loser = pid ?? me.id;
    const playerName = nameOf(loser);
    
    // Show message instead of auto-requeue
    setLostMessage(`${playerName}, find your name in the Players list below and click "Queue" to rejoin.`);
    setTimeout(() => setLostMessage(null), 8000);
    
    update(d => {
      const t = d.tables.find(tt => tt.a === loser || tt.b === loser);
      if (!t) return;
      if (t.a === loser) t.a = undefined;
      if (t.b === loser) t.b = undefined;
      // DO NOT add back to queue - let them manually rejoin
      excludeSeatPidRef.current = loser;
    }, { t: Date.now(), who: me.id, type: 'lost', note: playerName });
  };

  type DragInfo =
    | { type: 'seat'; table: number; side: 'a'|'b'; pid?: string }
    | { type: 'queue'; index: number; pid: string };

  const onDragStart = (e: React.DragEvent, info: DragInfo) => {
    if (!iHaveMod) return;
    try { e.dataTransfer.setData('application/json', JSON.stringify(info)); } catch {}
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const onDragOver = (e: React.DragEvent) => { if (!iHaveMod) return; e.preventDefault(); };
  
  const parseInfo = (ev: React.DragEvent): DragInfo | null => {
    try {
      const raw = ev.dataTransfer.getData('application/json');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };
  
  const handleDrop = (ev: React.DragEvent, target: DragInfo) => {
    if (!iHaveMod) return; 
    ev.preventDefault();
    const src = parseInfo(ev); 
    if (!src) return;
    
    update(d => {
      const moveWithin = (arr: string[], from: number, to: number) => {
        const a = [...arr]; 
        const [p] = a.splice(from, 1);
        a.splice(Math.max(0, Math.min(a.length, to)), 0, p); 
        return a;
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
          const sp = d.tables[src.table][src.side], tp = d.tables[target.table][target.side];
          d.tables[src.table][src.side] = tp; 
          d.tables[target.table][target.side] = sp;
        } else if (src.type === 'queue') {
          d.queue = d.queue.filter(x => x !== src.pid);
          placeSeat(target.table, target.side, src.pid);
        }
      } else if (target.type === 'queue') {
        if (src.type === 'queue') d.queue = moveWithin(d.queue, src.index, target.index);
        else if (src.type === 'seat') {
          const pid = d.tables[src.table][src.side];
          d.tables[src.table][src.side] = undefined;
          if (pid) d.queue.splice(target.index, 0, pid);
        }
      }
    });
  };

  const seatedIndex = g.tables.findIndex((t) => t.a === me.id || t.b === me.id);
  const seated = seatedIndex >= 0;

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e?.target?.value ?? '';
    setNameField(v);
  };
  
  const onTableLabelChange = (tableIdx: number) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = (e?.target?.value ?? '8 foot') as TableLabel;
      update(d => { d.tables[tableIdx].label = v; }, { t: Date.now(), who: me.id, type: 'set-table', note: `Table ${tableIdx+1} → ${v}` });
    };

  return (
    <main ref={pageRootRef} style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Local</span>
          <button style={btnGhostSm} onClick={()=>{ const fresh = loadLocal(); setG(fresh); }}>Reload</button>
          <button style={btnGhostSm} onClick={()=>{ localStorage.removeItem(LS_KEY); setG(loadLocal()); }}>Reset</button>
        </div>
      </div>

      {lostMessage && (
        <div style={messageBox}>
          ℹ️ {lostMessage}
        </div>
      )}

      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input
              id="list-name"
              name="listName"
              autoComplete="organization"
              defaultValue={g.name}
              onBlur={(e)=>iHaveMod && renameList(e.currentTarget?.value ?? g.name)}
              style={nameInput}
              disabled={busy || !iHaveMod}
            />
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Mode: <b>Local List</b> • {g.players.length} {g.players.length === 1 ? 'player' : 'players'}
            <span style={{opacity:.6}}>•</span>
            <button style={btnGhostSm} onClick={()=>setShowHistory(v=>!v)}>{showHistory?'Hide':'Show'} history</button>
          </div>
        </div>
        <div style={{display:'grid',gap:6,justifyItems:'end'}}>
          {!seated && !g.queue.includes(me.id) && <button style={btn} onClick={joinQueue} disabled={busy}>Join queue</button>}
          {g.queue.includes(me.id) && <button style={btnGhost} onClick={leaveQueue} disabled={busy}>Leave queue</button>}
          {players.some(p => p.id === me.id) && (
            <button style={btnGhost} onClick={leaveList} disabled={busy}>Leave list</button>
          )}
        </div>
      </header>

      {showHistory && (
        <section style={card}>
          <h3 style={{marginTop:0}}>History (last {g.audit?.length ?? 0})</h3>
          {(g.audit?.length ?? 0) === 0 ? <div style={{opacity:.7}}>No actions yet.</div> : (
            <ul style={{listStyle:'none',padding:0,margin:0,display:'grid',gap:6,maxHeight:220,overflow:'auto'}}>
              {g.audit!.slice().reverse().map((a,i)=>(
                <li key={i} style={{background:'#111',border:'1px solid #222',borderRadius:8,padding:'8px 10px',fontSize:13}}>
                  <b style={{opacity:.9}}>{a.type}</b>
                  {a.note ? <span style={{opacity:.85}}> — {a.note}</span> : null}
                  <span style={{opacity:.6,marginLeft:6}}>{new Date(a.t).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{marginTop:0}}>Tables</h3>
          {iHaveMod && <button style={btnGhostSm} onClick={()=>setShowTableControls(v=>!v)}>{showTableControls?'Hide table settings':'Table settings'}</button>}
        </div>

        {showTableControls && iHaveMod && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginBottom:12}}>
            {g.tables.map((t,i)=>(
              <div key={i} style={{background:'#111',border:'1px solid #333',borderRadius:10,padding:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:600,opacity:.9}}>Table {i+1}</div>
                  <select
                    value={t.label ?? '8 foot'}
                    onChange={onTableLabelChange(i)}
                    style={select}
                    disabled={busy || !iHaveMod}
                  >
                    <option value="9 foot">9-foot</option>
                    <option value="8 foot">8-foot</option>
                  </select>
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button style={btnGhostSm} onClick={()=>update(d=>{ if (d.tables.length<2) d.tables.push({label:d.tables[0]?.label==='9 foot'?'8 foot':'9 foot'}); })} disabled={busy||g.tables.length>=2 || !iHaveMod}>Add second table</button>
              <button style={btnGhostSm} onClick={()=>update(d=>{ if (d.tables.length>1) d.tables=d.tables.slice(0,1); })} disabled={busy||g.tables.length<=1 || !iHaveMod}>Use one table</button>
            </div>
          </div>
        )}

        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap:12}}>
          {g.tables.map((t,i)=>{
            const Seat = ({side}:{side:'a'|'b'})=>{
              const pid = t[side];
              return (
                <div
                  draggable={!!pid && iHaveMod && supportsDnD}
                  onDragStart={(e)=>pid && onDragStart(e,{type:'seat',table:i,side,pid})}
                  onDragOver={supportsDnD ? onDragOver : undefined}
                  onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'seat',table:i,side,pid}) : undefined}
                  style={{minHeight:24,padding:'8px 10px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:8,background:'rgba(56,189,248,.10)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}
                  title={supportsDnD ? 'Drag from queue or swap seats' : 'Use Queue controls'}
                >
                  <span>{nameOf(pid)}</span>
                  {pid && (iHaveMod || pid===me.id) && <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>}
                </div>
              );
            };
            return (
              <div key={i} style={{ background:'#0b3a66', borderRadius:12, padding:'12px 14px', border:'1px solid rgba(56,189,248,.35)'}}>
                <div style={{ opacity:.9, fontSize:12, marginBottom:6 }}>{t.label==='9 foot'?'9-Foot Table':'8-Foot Table'} • Table {i+1}</div>
                <div style={{ display:'grid', gap:8 }}>
                  <Seat side="a"/><div style={{opacity:.7,textAlign:'center'}}>vs</div><Seat side="b"/>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
          {iHaveMod && queue.length >= 2 && (
            <button style={btnGhostSm} onClick={skipFirst} disabled={busy} title="Move #1 below #2">Skip first</button>
          )}
        </div>

        {queue.length===0 ? <div style={{opacity:.6,fontStyle:'italic'}}>Drop players here</div> : (
          <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}
              onDragOver={supportsDnD ? onDragOver : undefined}
              onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'queue',index:queue.length,pid:'__end' as any}) : undefined}>
            {queue.map((pid,idx)=>{
              const pref = (prefs[pid] ?? 'any') as Pref;
              const canEditSelf = pid===me.id;
              return (
                <li key={`${pid}-${idx}`}
                    draggable={supportsDnD && iHaveMod}
                    onDragStart={supportsDnD && iHaveMod ? (e)=>onDragStart(e,{type:'queue',index:idx,pid}) : undefined}
                    onDragOver={supportsDnD ? onDragOver : undefined}
                    onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'queue',index:idx,pid}) : undefined}
                    style={queueItem}>
                  <span style={bubbleName} title={supportsDnD ? 'Drag to reorder' : 'Use arrows to reorder'}>
                    {idx+1}. {nameOf(pid)}
                  </span>

                  {!supportsDnD && iHaveMod && (
                    <div style={{display:'flex',gap:4,marginRight:6}}>
                      <button style={btnTiny} onClick={()=>moveUp(idx)} disabled={busy || idx===0} aria-label="Move up">▲</button>
                      <button style={btnTiny} onClick={()=>moveDown(idx)} disabled={busy || idx===queue.length-1} aria-label="Move down">▼</button>
                    </div>
                  )}

                  <div style={{display:'flex',gap:6}}>
                    {(iHaveMod || canEditSelf) ? (
                      <>
                        <button style={pref==='9 foot'?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,'9 foot');}} disabled={busy}>9-ft</button>
                        <button style={pref==='8 foot'?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,'8 foot');}} disabled={busy}>8-ft</button>
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

      {iHaveMod && (
        <section style={card}>
          <h3 style={{marginTop:0}}>Host controls</h3>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
            <input
              id="new-player"
              name="playerName"
              autoComplete="name"
              placeholder="Add player name..."
              value={nameField}
              onChange={onNameChange}
              style={input}
              disabled={busy}
            />
            <button style={btn} onClick={addPlayer} disabled={busy || !nameField.trim()}>Add player (joins queue)</button>
          </div>
        </section>
      )}

      <section style={card}>
        <h3 style={{marginTop:0}}>List (Players) — {players.length}</h3>
        {players.length===0 ? <div style={{opacity:.7}}>No players yet.</div> : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {players.map(p=>{
              const pref = (prefs[p.id] ?? 'any') as Pref;
              const canEditSelf = p.id===me.id;
              const isCohost = (g.cohosts ?? []).includes(p.id);
              return (
                <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                  <span>{p.name}{isCohost ? <em style={{opacity:.6,marginLeft:8}}>(Cohost)</em> : null}</span>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {!inQueue(p.id)
                      ? (iHaveMod ? <button style={btnMini} onClick={()=>enqueuePid(p.id)} disabled={busy}>Queue</button> : null)
                      : (iHaveMod ? <button style={btnMini} onClick={()=>dequeuePid(p.id)} disabled={busy}>Dequeue</button> : null)}
                    {(iHaveMod || canEditSelf) && (
                      <div style={{display:'flex',gap:6}}>
                        <button style={pref==='any'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'any')} disabled={busy}>Any</button>
                        <button style={pref==='9 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'9 foot')} disabled={busy}>9-ft</button>
                        <button style={pref==='8 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'8 foot')} disabled={busy}>8-ft</button>
                      </div>
                    )}
                    {iHaveMod && p.id !== g.hostId && (
                      <button style={btnMini} onClick={()=>toggleCohost(p.id)} disabled={busy}>
                        {isCohost ? 'Remove cohost' : 'Make cohost'}
                      </button>
                    )}
                    {(iHaveMod || canEditSelf) && <button style={btnMini} onClick={()=>renamePlayer(p.id)} disabled={busy}>Rename</button>}
                    {iHaveMod && <button style={btnGhost} onClick={()=>removePlayer(p.id)} disabled={busy}>Remove</button>}
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

const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui', WebkitTouchCallout:'none' };
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
const messageBox: React.CSSProperties = { 
  background:'rgba(14,165,233,0.15)', 
  border:'1px solid rgba(14,165,233,0.35)', 
  borderRadius:12, 
  padding:'12px 14px', 
  marginTop:8,
  fontSize:14,
  fontWeight:600
};
const bubbleName: React.CSSProperties = {
  flex: '1 1 auto',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px dashed rgba(255,255,255,.35)',
  background: 'rgba(255,255,255,.06)',
  cursor: 'grab',
  userSelect: 'none',
};
const queueItem: React.CSSProperties = {
  cursor:'grab',
  display:'flex',
  alignItems:'center',
  gap:10,
  justifyContent:'space-between'
};={pref==='any'?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,'any');}} disabled={busy}>Any</button>
                        <button style