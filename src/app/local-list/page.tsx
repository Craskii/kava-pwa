'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '@/components/BackButton';
import AlertsToggle from '@/components/AlertsToggle';
import { uid } from '@/lib/storage';

/* ---------- types (same shape as online) ---------- */
type TableLabel = '8 foot' | '9 foot';
type Table = { a?: string; b?: string; label: TableLabel };
type Player = { id: string; name: string };
type Pref = '8 foot' | '9 foot' | 'any';
type ListGame = {
  id: string; name: string; hostId: string;
  status: 'active'; createdAt: number;
  tables: Table[]; players: Player[];
  queue: string[];
  prefs: Record<string, Pref>;
  cohosts: string[];
  audit: { t:number; type:string; note?:string }[];
  v: number; schema: 'v2';
};

/* ---------- storage helpers ---------- */
const LS_KEY = 'kava_local_list_v2';
function loadLocal(): ListGame {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { return JSON.parse(raw) as ListGame; } catch {}
  }
  const me = ensureMe();
  return {
    id: 'local',
    name: 'Local List',
    hostId: me.id,
    status: 'active',
    createdAt: Date.now(),
    tables: [{ label:'9 foot' }, { label:'8 foot' }],
    players: [me],
    queue: [],
    prefs: { [me.id]:'any' },
    cohosts: [],
    audit: [],
    v: 1,
    schema: 'v2',
  };
}
function saveLocal(g: ListGame) {
  localStorage.setItem(LS_KEY, JSON.stringify(g));
}
function ensureMe(): Player {
  try {
    const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
    if (saved?.id) return saved;
  } catch {}
  const fresh = { id: uid(), name: 'Player' };
  localStorage.setItem('kava_me', JSON.stringify(fresh));
  return fresh;
}

/* ---------- component ---------- */
export default function LocalListPage() {
  const me = useMemo(ensureMe, []);
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [supportsDnD, setSupportsDnD] = useState<boolean>(false);

  useEffect(() => {
    setSupportsDnD(!('ontouchstart' in window));
    const init = loadLocal();
    setG(init);
    // keep me in players
    if (!init.players.some(p=>p.id===me.id)) {
      const next = { ...init, players:[...init.players, me], prefs:{...init.prefs, [me.id]:'any'}, v:init.v+1 };
      setG(next); saveLocal(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist every change
  useEffect(() => { if (g) saveLocal(g); }, [g]);

  const pageRootRef = useRef<HTMLDivElement|null>(null);
  useEffect(() => {
    const root = pageRootRef.current;
    if (!root) return;
    const prevent = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
    };
    root.addEventListener('contextmenu', prevent);
    return () => root.removeEventListener('contextmenu', prevent);
  }, []);

  if (!g) {
    return (
      <main ref={pageRootRef} style={wrap}>
        <BackButton href="/" />
        <p style={{opacity:.7}}>Loading local list…</p>
      </main>
    );
  }

  const players = g.players;
  const queue = g.queue;
  const prefs = g.prefs;
  const nameOf = (pid?: string) => (pid ? players.find(p => p.id === pid)?.name || '??' : '—');
  const inQueue = (pid:string)=> queue.includes(pid);

  /* ---------- actions (pure local) ---------- */
  const bump = (mut:(d:ListGame)=>void) => {
    setG(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      mut(next);
      next.v = (next.v||0)+1;
      return next;
    });
  };
  const renameList = (nm:string) => { const v = nm.trim(); if (!v) return; bump(d=>{ d.name=v; }); };
  const addPlayer = () => {
    const v = nameField.trim(); if (!v) return;
    setNameField('');
    const p: Player = { id: uid(), name: v };
    bump(d => { d.players.push(p); d.prefs[p.id]='any'; if (!d.queue.includes(p.id)) d.queue.push(p.id); });
  };
  const removePlayer = (pid:string) => bump(d => {
    d.players = d.players.filter(p=>p.id!==pid);
    d.queue = d.queue.filter(x=>x!==pid);
    delete d.prefs[pid];
    d.tables = d.tables.map(t=>({ ...t, a: t.a===pid?undefined:t.a, b: t.b===pid?undefined:t.b }));
  });
  const setPrefFor = (pid:string, pref:Pref) => bump(d => { d.prefs[pid]=pref; });
  const enqueuePid = (pid:string) => bump(d => { if (!d.queue.includes(pid)) d.queue.push(pid); });
  const dequeuePid = (pid:string) => bump(d => { d.queue = d.queue.filter(x=>x!==pid); });

  const iLost = (pid?:string) => {
    const loser = pid ?? me.id;
    bump(d => {
      const t = d.tables.find(tt => tt.a===loser || tt.b===loser);
      if (!t) return;
      if (t.a===loser) t.a=undefined;
      if (t.b===loser) t.b=undefined;
      d.queue = d.queue.filter(x=>x!==loser);
      d.queue.push(loser);
    });
  };

  /* ---------- DnD ---------- */
  type DragInfo =
    | { type:'seat'; table:number; side:'a'|'b'; pid?:string }
    | { type:'queue'; index:number; pid:string };
  const onDragStart = (e:React.DragEvent, info:DragInfo) => { e.dataTransfer.setData('application/json', JSON.stringify(info)); e.dataTransfer.effectAllowed='move'; };
  const onDragOver = (e:React.DragEvent) => { e.preventDefault(); };
  const parseInfo = (e:React.DragEvent):DragInfo|null => { try { return JSON.parse(e.dataTransfer.getData('application/json')); } catch { return null; } };
  const handleDrop = (e:React.DragEvent, target:DragInfo) => {
    e.preventDefault();
    const src = parseInfo(e); if (!src) return;
    bump(d=>{
      const moveWithin = (arr:string[], from:number, to:number) => { const a=[...arr]; const [p]=a.splice(from,1); a.splice(Math.max(0,Math.min(a.length,to)),0,p); return a; };
      const removeEverywhere = (pid:string) => { d.queue = d.queue.filter(x=>x!==pid); d.tables = d.tables.map(t=>({ ...t, a:t.a===pid?undefined:t.a, b:t.b===pid?undefined:t.b })); };
      const placeSeat = (ti:number, side:'a'|'b', pid?:string) => { if (!pid) return; removeEverywhere(pid); d.tables[ti][side]=pid; };

      if (target.type==='seat') {
        if (src.type==='seat') {
          const sp = d.tables[src.table][src.side], tp = d.tables[target.table][target.side];
          d.tables[src.table][src.side]=tp; d.tables[target.table][target.side]=sp;
        } else if (src.type==='queue') {
          d.queue = d.queue.filter(x=>x!==src.pid);
          placeSeat(target.table, target.side, src.pid);
        }
      } else if (target.type==='queue') {
        if (src.type==='queue') d.queue = moveWithin(d.queue, src.index, target.index);
        else if (src.type==='seat') { const pid = d.tables[src.table][src.side]; d.tables[src.table][src.side]=undefined; if (pid) d.queue.splice(target.index,0,pid); }
      }
    });
  };

  return (
    <main ref={pageRootRef} style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Local</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={()=>setShowSettings(true)}>Settings</button>
        </div>
      </div>

      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input
              defaultValue={g.name}
              onBlur={(e)=>renameList(e.currentTarget.value)}
              style={nameInput}
              disabled={busy}
            />
          </h1>
          <div style={{ opacity:.8, fontSize:14 }}>
            {g.players.length} {g.players.length===1?'player':'players'}
          </div>
        </div>
        <div style={{display:'grid',gap:6,justifyItems:'end'}}>
          {!g.queue.includes(me.id) && <button style={btn} onClick={()=>enqueuePid(me.id)} disabled={busy}>Join queue</button>}
          {g.queue.includes(me.id) && <button style={btnGhost} onClick={()=>dequeuePid(me.id)} disabled={busy}>Leave queue</button>}
        </div>
      </header>

      {/* Tables */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Tables</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:12}}>
          {g.tables.map((t,i)=>{
            const Seat = ({side}:{side:'a'|'b'})=>{
              const pid = t[side];
              return (
                <div
                  draggable={!!pid && supportsDnD}
                  onDragStart={(e)=>pid && onDragStart(e,{type:'seat',table:i,side,pid})}
                  onDragOver={supportsDnD ? onDragOver : undefined}
                  onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'seat',table:i,side,pid}) : undefined}
                  style={{minHeight:24,padding:'8px 10px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:8,background:'rgba(56,189,248,.10)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}
                >
                  <span>{nameOf(pid)}</span>
                  {pid && <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>}
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

      {/* Queue */}
      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8'}}>
          <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
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
                    draggable={supportsDnD}
                    onDragStart={supportsDnD ? (e)=>onDragStart(e,{type:'queue',index:idx,pid}) : undefined}
                    onDragOver={supportsDnD ? onDragOver : undefined}
                    onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'queue',index:idx,pid}) : undefined}
                    style={queueItem}>
                  <span style={bubbleName}>{idx+1}. {nameOf(pid)}</span>
                  <div style={{display:'flex',gap:6}}>
                    {(canEditSelf) ? (
                      <>
                        <button style={pref==='any'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(pid,'any')} disabled={busy}>Any</button>
                        <button style={pref==='9 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(pid,'9 foot')} disabled={busy}>9-ft</button>
                        <button style={pref==='8 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(pid,'8 foot')} disabled={busy}>8-ft</button>
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

      {/* Host controls */}
      <section style={card}>
        <h3 style={{marginTop:0}}>Players — {players.length}</h3>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          <input
            placeholder="Add player name..."
            value={nameField}
            onChange={(e)=>setNameField(e.target.value)}
            style={input}
            disabled={busy}
          />
          <button style={btn} onClick={addPlayer} disabled={busy || !nameField.trim()}>Add player (joins queue)</button>
        </div>
        {players.length===0 ? <div style={{opacity:.7}}>No players yet.</div> : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {players.map(p=>{
              const pref = (prefs[p.id] ?? 'any') as Pref;
              const isMe = p.id===me.id;
              return (
                <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                  <span>{p.name}{isMe ? <em style={{opacity:.6,marginLeft:8}}>(You)</em> : null}</span>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {!inQueue(p.id)
                      ? <button style={btnMini} onClick={()=>enqueuePid(p.id)} disabled={busy}>Queue</button>
                      : <button style={btnMini} onClick={()=>dequeuePid(p.id)} disabled={busy}>Dequeue</button>}
                    <div style={{display:'flex',gap:6}}>
                      <button style={pref==='any'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'any')} disabled={busy}>Any</button>
                      <button style={pref==='9 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'9 foot')} disabled={busy}>9-ft</button>
                      <button style={pref==='8 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'8 foot')} disabled={busy}>8-ft</button>
                    </div>
                    <button style={btnMini} onClick={()=>removePlayer(p.id)} disabled={busy}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showSettings && (
        <SettingsSheet
          initialTables={g.tables}
          onClose={()=>setShowSettings(false)}
          onApply={(tables, resetAll)=>{
            bump(d=>{
              d.tables = tables.map(t=>({ label:t.label, a: undefined, b: undefined }));
              if (resetAll) {
                d.queue = [];
                d.players = [ensureMe()];
                d.prefs = { [ensureMe().id]:'any' };
              }
            });
            setShowSettings(false);
          }}
        />
      )}
    </main>
  );
}

/* ---------- Settings Sheet (controlled state; no DOM reads) ---------- */
function SettingsSheet(props:{
  initialTables: Table[];
  onClose: ()=>void;
  onApply: (tables:Table[], resetAll:boolean)=>void;
}) {
  const [count, setCount] = useState(Math.min(2, Math.max(1, props.initialTables.length || 1)));
  const [label1, setLabel1] = useState<TableLabel>(props.initialTables[0]?.label ?? '9 foot');
  const [label2, setLabel2] = useState<TableLabel>(props.initialTables[1]?.label ?? (label1==='9 foot'?'8 foot':'9 foot'));
  const [resetAll, setResetAll] = useState(false);

  const tables: Table[] = count===1
    ? [{ label: label1 }]
    : [{ label: label1 }, { label: label2 }];

  return (
    <div style={sheetWrap} role="dialog" aria-modal="true">
      <div style={sheetCard}>
        <h3 style={{marginTop:0}}>Local List Settings</h3>

        <div style={{display:'grid',gap:10}}>
          <label style={rowBetween}>
            <span>Number of tables</span>
            <select
              value={count}
              onChange={(e)=>setCount(Number(e.target.value)===2?2:1)}
              style={select}
            >
              <option value={1}>1 table</option>
              <option value={2}>2 tables</option>
            </select>
          </label>

          <label style={rowBetween}>
            <span>Table 1 size</span>
            <select value={label1} onChange={(e)=>setLabel1(e.target.value==='8 foot'?'8 foot':'9 foot')} style={select}>
              <option value="9 foot">9-foot</option>
              <option value="8 foot">8-foot</option>
            </select>
          </label>

          {count===2 && (
            <label style={rowBetween}>
              <span>Table 2 size</span>
              <select value={label2} onChange={(e)=>setLabel2(e.target.value==='8 foot'?'8 foot':'9 foot')} style={select}>
                <option value="9 foot">9-foot</option>
                <option value="8 foot">8-foot</option>
              </select>
            </label>
          )}

          <label style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="checkbox" checked={resetAll} onChange={(e)=>setResetAll(e.target.checked)} />
            Reset players & queue
          </label>
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}>
          <button style={btnGhost} onClick={props.onClose}>Cancel</button>
          <button style={btn} onClick={()=>props.onApply(tables, resetAll)}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui', WebkitTouchCallout:'none' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnGhostSm: React.CSSProperties = { padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const btnTiny: React.CSSProperties = { padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12, lineHeight:1 };
const btnTinyActive: React.CSSProperties = { ...btnTiny, background:'#0ea5e9', border:'none' };
const pillBadge: React.CSSProperties = { padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const input: React.CSSProperties = { width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' } as any;
const nameInput: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
const select: React.CSSProperties = { background:'#111', border:'1px solid #333', color:'#fff', borderRadius:8, padding:'6px 8px' };
const bubbleName: React.CSSProperties = { flex:'1 1 auto', padding:'6px 10px', borderRadius:999, border:'1px dashed rgba(255,255,255,.35)', background:'rgba(255,255,255,.06)', cursor:'grab', userSelect:'none' };
const queueItem: React.CSSProperties = { cursor:'grab', display:'flex', alignItems:'center', gap:10, justifyContent:'space-between' };

const sheetWrap: React.CSSProperties = {
  position:'fixed', inset:0, background:'rgba(0,0,0,.55)',
  display:'grid', placeItems:'center', padding:16, zIndex:50
};
const sheetCard: React.CSSProperties = {
  width:'min(520px, 95vw)',
  background:'#0f1115',
  border:'1px solid #2a2f3a',
  borderRadius:14,
  padding:16,
  boxShadow:'0 12px 40px rgba(0,0,0,.5)'
};
const rowBetween: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 };
