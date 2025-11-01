// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { uid } from '@/lib/storage';
import { useRoomChannel } from '@/hooks/useRoomChannel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import DebugPanel, { debugLine } from '@/components/DebugPanel';

/* ============ Types ============ */
type TableLabel = '8 foot' | '9 foot';
type Table = { a?: string; b?: string; label: TableLabel };
type Player = { id: string; name: string };
type Pref = '8 foot' | '9 foot' | 'any';
type AuditEntry = { t: number; who?: string; type: string; note?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string;
  status: 'active'; createdAt: number;
  tables: Table[]; players: Player[];
  queue?: string[];
  queue8?: string[]; queue9?: string[];
  prefs?: Record<string, Pref>;
  cohosts?: string[];
  audit?: AuditEntry[];
  v?: number; schema?: 'v2';
};

/* ============ Helpers ============ */
function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t: any, i: number) => ({
          a: t?.a ? String(t.a) : undefined,
          b: t?.b ? String(t.b) : undefined,
          label: t?.label === '9 foot' || t?.label === '8 foot' ? t.label : i === 1 ? '9 foot' : '8 foot',
        }))
      : [{ label: '8 foot' }, { label: '9 foot' }];

    const players: Player[] = Array.isArray(raw.players)
      ? raw.players.map((p: any) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? 'Player') }))
      : [];

    const prefs: Record<string, Pref> = {};
    if (raw.prefs && typeof raw.prefs === 'object') {
      for (const [pid, v] of Object.entries(raw.prefs)) {
        const vv = String(v);
        prefs[pid] = vv === '9 foot' || vv === '8 foot' || vv === 'any' ? (vv as Pref) : 'any';
      }
    }
    for (const p of players) if (!prefs[p.id]) prefs[p.id] = 'any';

    let queue: string[] = Array.isArray(raw.queue)
      ? raw.queue.map((x: any) => String(x)).filter(Boolean)
      : [];
    if (queue.length === 0) {
      queue = [
        ...(Array.isArray(raw.queue9) ? raw.queue9 : []),
        ...(Array.isArray(raw.queue8) ? raw.queue8 : []),
      ].map((x: any) => String(x)).filter(Boolean);
    }

    const cohosts: string[] =
      Array.isArray(raw.cohosts) ? raw.cohosts.map(String) :
      Array.isArray(raw.coHosts) ? raw.coHosts.map(String) :
      [];

    const audit: AuditEntry[] = Array.isArray(raw.audit) ? raw.audit.slice(-100) : [];

    return {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? 'Untitled'),
      code: raw.code ? String(raw.code) : undefined,
      hostId: String(raw.hostId ?? ''),
      status: 'active',
      createdAt: Number(raw.createdAt ?? Date.now()),
      tables, players, queue, prefs,
      cohosts, audit,
      v: Number.isFinite(raw.v) ? Number(raw.v) : 0,
      schema: 'v2',
    };
  } catch { return null; }
}

/* POST save (mirror coHosts & send x-user-id) */
async function saveList(doc: ListGame) {
  try {
    const me = JSON.parse(localStorage.getItem('kava_me') || 'null');
    const payload: any = { ...doc, schema: 'v2' };
    // keep both keys mirrored for older clients/servers
    payload.coHosts = Array.isArray(doc.cohosts) ? [...doc.cohosts] : [];
    payload.cohosts = Array.isArray(doc.cohosts) ? [...doc.cohosts] : [];
    await fetch(`/api/list/${encodeURIComponent(doc.id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': me?.id || '' },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: 'no-store',
    });
  } catch {}
}

/* ============ Component ============ */
export default function ListLobby() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ''));

  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [showTableControls, setShowTableControls] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [supportsDnD, setSupportsDnD] = useState<boolean>(false);
  useEffect(() => { setSupportsDnD(!('ontouchstart' in window)); }, []);

  const me = useMemo<Player>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Player' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
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

  const lastSeatSig = useRef<string>('');
  const excludeSeatPidRef = useRef<string | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);

  const seatChanged = (next: ListGame | null) => {
    if (!next) return false;
    const i = next.tables.findIndex(t => t.a === me.id || t.b === me.id);
    if (i < 0) { if (lastSeatSig.current) { lastSeatSig.current = ''; return true; } return false; }
    const t = next.tables[i]; const sig = `t${i}-${t.a ?? 'x'}-${t.b ?? 'x'}`;
    if (sig !== lastSeatSig.current) { lastSeatSig.current = sig; return true; }
    return false;
  };

  /* ---- Initial snapshot ---- */
  useEffect(() => {
    if (!id || id === 'create') {
      setG(null);
      setErr(id === 'create' ? 'Waiting for a new list id…' : null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) { setErr(`Failed to load list (${res.status})`); return; }
        const doc = coerceList(await res.json()); if (!doc) { setErr('Invalid list data'); return; }
        if (!cancelled) { setErr(null); setG(doc); }
      } catch { if (!cancelled) setErr('Network error loading list'); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Live room feed: if DO publishes `{ t:'state', data:<listDoc> }`, apply it.
useRoomChannel('list', id, (msg) => {
  try {
    if (!msg) return;
    if (msg.t === 'state' && msg.data) {
      debugLine(`[SSE] v=${msg.data?.v ?? '-'} players=${(msg.data?.players||[]).length}`);
      const doc = coerceList(msg.data);
      if (!doc) return;
      const incomingV = doc.v ?? 0;
      if (incomingV <= (lastVersion.current || 0)) return;
      lastVersion.current = incomingV;
      setErr(null);
      setG(doc);
      if (seatChanged(doc)) bumpAlerts();
    }
  } catch (e:any) {
    debugLine(`[SSE handler error] ${e?.message || e}`);
    // do not throw
  }
});
  /* ---- Disable Android long-press ---- */
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

  /* ---- Early UI ---- */
  if (!id || !g) {
    return (
  <ErrorBoundary>
    <main ref={pageRootRef} style={wrap}>
        <BackButton href="/" />
        <p style={{ opacity: 0.7 }}>Loading…</p>
        {err && <p style={{opacity:.7, marginTop:6, fontSize:13}}>{err}</p>}
      </main>
    <DebugPanel/>
  </ErrorBoundary>
    );
  }

  const queue = g.queue ?? [];
  const prefs = g.prefs || {};
  const players = g.players;
  const iAmHost = me.id === g.hostId;
  const iAmCohost = (g.cohosts ?? []).includes(me.id);
  const iHaveMod = iAmHost || iAmCohost;
  const seatedIndex = g.tables.findIndex((t) => t.a === me.id || t.b === me.id);
  const seated = seatedIndex >= 0;
  const nameOf = (pid?: string) => (pid ? players.find(p => p.id === pid)?.name || '??' : '—');
  const inQueue = (pid: string) => queue.includes(pid);

  /* ---- seating helper ---- */
  function autoSeat(next: ListGame) {
    const excluded = excludeSeatPidRef.current;
    const pmap = next.prefs || {};

    const takeFromQueue = (want: TableLabel) => {
      for (let i = 0; i < (next.queue ?? []).length; i++) {
        const pid = next.queue![i];
        if (!pid) { next.queue!.splice(i, 1); i--; continue; }
        if (excluded && pid === excluded) continue;
        const pref = (pmap[pid] ?? 'any') as Pref;
        if (pref === 'any' || pref === want) { next.queue!.splice(i, 1); return pid; }
      }
      return undefined;
    };

    const fillFromPlayersIfNoQueue = (next.queue ?? []).length === 0;
    const seatedSet = new Set<string>();
    for (const t of next.tables) { if (t.a) seatedSet.add(t.a); if (t.b) seatedSet.add(t.b); }

    const candidates = fillFromPlayersIfNoQueue
      ? next.players.map(p => p.id).filter(pid => !seatedSet.has(pid))
      : [];

    const takeFromPlayers = (want: TableLabel) => {
      for (let i = 0; i < candidates.length; i++) {
        const pid = candidates[i];
        if (!pid) continue;
        if (excluded && pid === excluded) continue;
        const pref = (pmap[pid] ?? 'any') as Pref;
        if (pref === 'any' || pref === want) { candidates.splice(i, 1); return pid; }
      }
      return undefined;
    };

    next.tables.forEach((t) => {
      if (!t.a) {
        const fromQ = takeFromQueue(t.label);
        const pid = fromQ ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined);
        if (pid) t.a = pid;
      }
      if (!t.b) {
        const fromQ = takeFromQueue(t.label);
        const pid = fromQ ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined);
        if (pid) t.b = pid;
      }
    });

    excludeSeatPidRef.current = null;
  }

  /* ---- commit batching ---- */
  const commitQ = useRef<(() => Promise<void>)[]>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<ListGame | null>(null);

  function flushPending() {
    if (!pendingDraft.current) return;
    const toSave = pendingDraft.current;
    pendingDraft.current = null;
    commitQ.current.push(async () => {
      setBusy(true);
      try {
        setG(toSave);
        await saveList(toSave);
        if (seatChanged(toSave)) bumpAlerts();
      } finally {
        setBusy(false);
      }
    });
    if (commitQ.current.length === 1) runNext();
  }
  async function runNext() {
    const job = commitQ.current.shift(); if (!job) return;
    await job();
    if (commitQ.current.length) runNext();
  }
  function scheduleCommit(mut: (draft: ListGame) => void) {
    if (!g) return;
    if (!pendingDraft.current) {
      pendingDraft.current = JSON.parse(JSON.stringify(g));
      pendingDraft.current.prefs ??= {};
      for (const p of pendingDraft.current.players) if (!pendingDraft.current.prefs[p.id]) pendingDraft.current.prefs[p.id] = 'any';
      pendingDraft.current.v = (Number(pendingDraft.current.v) || 0) + 1;
    }
    mut(pendingDraft.current);
    (pendingDraft.current as any).coHosts = [...(pendingDraft.current.cohosts ?? [])];
    autoSeat(pendingDraft.current);
    setG(pendingDraft.current);
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(() => { batchTimer.current = null; flushPending(); }, 200);
  }

  /* ---- actions ---- */
  const renameList = (nm: string) => { const v = nm.trim(); if (!v) return; scheduleCommit(d => { d.name = v; }); };
  const ensureMe = (d: ListGame) => { if (!d.players.some(p => p.id === me.id)) d.players.push(me); d.prefs ??= {}; if (!d.prefs[me.id]) d.prefs[me.id] = 'any'; };
  const joinQueue = () => scheduleCommit(d => { ensureMe(d); d.queue ??= []; if (!d.queue.includes(me.id)) d.queue.push(me.id); });
  const leaveQueue = () => scheduleCommit(d => { d.queue = (d.queue ?? []).filter(x => x !== me.id); });
  const addPlayer = () => { const v = nameField.trim(); if (!v) return; setNameField(''); const p: Player = { id: uid(), name: v }; scheduleCommit(d => { d.players.push(p); d.prefs ??= {}; d.prefs[p.id] = 'any'; d.queue ??= []; if (!d.queue.includes(p.id)) d.queue.push(p.id); }); };
  const removePlayer = (pid: string) => scheduleCommit(d => { d.players = d.players.filter(p => p.id !== pid); d.queue = (d.queue ?? []).filter(x => x !== pid); if (d.prefs) delete d.prefs[pid]; d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b })); });
  const renamePlayer = (pid: string) => { const cur = players.find(p => p.id === pid)?.name || ''; const nm = prompt('Rename player', cur); if (!nm) return; const v = nm.trim(); if (!v) return; scheduleCommit(d => { const p = d.players.find(pp => pp.id === pid); if (p) p.name = v; }); };
  const setPrefFor = (pid: string, pref: Pref) => scheduleCommit(d => { d.prefs ??= {}; d.prefs[pid] = pref; });
  const enqueuePid = (pid: string) => scheduleCommit(d => { d.queue ??= []; if (!d.queue.includes(pid)) d.queue.push(pid); });
  const dequeuePid = (pid: string) => scheduleCommit(d => { d.queue = (d.queue ?? []).filter(x => x !== pid); });

  const leaveList = () => scheduleCommit(d => {
    d.players = d.players.filter(p => p.id !== me.id);
    d.queue = (d.queue ?? []).filter(x => x !== me.id);
    d.tables = d.tables.map(t => ({ ...t, a: t.a === me.id ? undefined : t.a, b: t.b === me.id ? undefined : t.b }));
    if (d.prefs) delete d.prefs[me.id];
  });

  const toggleCohost = (pid: string) => {
    scheduleCommit(d => {
      d.cohosts ??= [];
      const has = d.cohosts.includes(pid);
      d.cohosts = has ? d.cohosts.filter(x => x !== pid) : [...d.cohosts, pid];
      (d as any).coHosts = [...d.cohosts];
    });
  };

  const moveUp = (index: number) => scheduleCommit(d => {
    d.queue ??= [];
    if (index <= 0 || index >= d.queue.length) return;
    const a = d.queue[index - 1]; d.queue[index - 1] = d.queue[index]; d.queue[index] = a;
  });
  const moveDown = (index: number) => scheduleCommit(d => {
    d.queue ??= [];
    if (index < 0 || index >= d.queue.length - 1) return;
    const a = d.queue[index + 1]; d.queue[index + 1] = d.queue[index]; d.queue[index] = a;
  });

  const skipFirst = () => scheduleCommit(d => {
    d.queue ??= [];
    if (d.queue.length >= 2) {
      const first = d.queue.shift()!; const second = d.queue.shift()!;
      d.queue.unshift(first); d.queue.unshift(second);
    }
  });

  const iLost = (pid?: string) => {
    const loser = pid ?? me.id;
    scheduleCommit(d => {
      const t = d.tables.find(tt => tt.a === loser || tt.b === loser);
      if (!t) return;
      if (t.a === loser) t.a = undefined;
      if (t.b === loser) t.b = undefined;
      d.queue = (d.queue ?? []).filter(x => x !== loser);
      d.queue!.push(loser);
      excludeSeatPidRef.current = loser;
    });
  };

  /* ---- UI ---- */
  return (
    <main ref={pageRootRef} style={wrap}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <BackButton href="/" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={pillBadge}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={()=>location.reload()}>Refresh</button>
        </div>
      </div>

      {!g ? (
        <>
          <p style={{ opacity: 0.7 }}>Loading…</p>
          {err && <p style={{opacity:.7, marginTop:6, fontSize:13}}>{err}</p>}
        </>
      ) : (
        <>
          <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
            <div>
              <h1 style={{ margin:'8px 0 4px' }}>
                <input
                  id="list-name"
                  name="listName"
                  autoComplete="organization"
                  defaultValue={g.name}
                  onBlur={(e)=>iHaveMod && renameList(e.currentTarget.value)}
                  style={nameInput}
                  disabled={busy || !iHaveMod}
                />
              </h1>
              <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                Private code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length === 1 ? 'player' : 'players'}
                <span style={{opacity:.6}}>•</span>
                <button style={btnGhostSm} onClick={()=>setShowHistory(v=>!v)}>{showHistory?'Hide':'Show'} history</button>
              </div>
            </div>
            <div style={{display:'grid',gap:6,justifyItems:'end'}}>
              {!seated && !queue.includes(me.id) && <button style={btn} onClick={joinQueue} disabled={busy}>Join queue</button>}
              {queue.includes(me.id) && <button style={btnGhost} onClick={leaveQueue} disabled={busy}>Leave queue</button>}
              {!iAmHost && players.some(p => p.id === me.id) && (
                <button style={btnGhost} onClick={leaveList} disabled={busy}>Leave list</button>
              )}
            </div>
          </header>

          {showHistory ? (
            <section style={card}>
              <h3 style={{marginTop:0}}>History (last {g.audit?.length ?? 0})</h3>
              {(g.audit?.length ?? 0) === 0 ? (
                <div style={{opacity:.7}}>No actions yet.</div>
              ) : (
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
          ) : null}

          {/* Tables */}
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
                      <select value={t.label} onChange={(e)=>scheduleCommit(d=>{ d.tables[i].label = e.currentTarget.value === '9 foot' ? '9 foot' : '8 foot'; })} style={select} disabled={busy || !iHaveMod}>
                        <option value="9 foot">9-foot</option><option value="8 foot">8-foot</option>
                      </select>
                    </div>
                  </div>
                ))}
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button style={btnGhostSm} onClick={()=>scheduleCommit(d=>{ if (d.tables.length<2) d.tables.push({label:d.tables[0]?.label==='9 foot'?'8 foot':'9 foot'}); })} disabled={busy||g.tables.length>=2 || !iHaveMod}>Add second table</button>
                  <button style={btnGhostSm} onClick={()=>scheduleCommit(d=>{ if (d.tables.length>1) d.tables=d.tables.slice(0,1); })} disabled={busy||g.tables.length<=1 || !iHaveMod}>Use one table</button>
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

          {/* Queue */}
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
                            <button style={pref==='any'?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,'any');}} disabled={busy}>Any</button>
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

          {/* Host / Co-host controls */}
          {iHaveMod ? (
            <section style={card}>
              <h3 style={{marginTop:0}}>Host controls</h3>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                <input
                  id="new-player"
                  name="playerName"
                  autoComplete="name"
                  placeholder="Add player name..."
                  value={nameField}
                  onChange={(e)=>setNameField(e.target.value)}
                  style={input}
                  disabled={busy}
                />
                <button style={btn} onClick={addPlayer} disabled={busy || !nameField.trim()}>Add player (joins queue)</button>
              </div>
            </section>
          ) : null}

          {/* Players */}
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
        </>
      )}
    </main>
  );
}

/* ============ Styles ============ */
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
};
