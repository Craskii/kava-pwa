// src/app/local-list/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

/* ============ Types ============ */
type TableLabel = '8 foot' | '9 foot';
type Table = { a?: string; b?: string; a1?: string; a2?: string; b1?: string; b2?: string; label: TableLabel };
type SeatKey = keyof Pick<Table, 'a' | 'b' | 'a1' | 'a2' | 'b1' | 'b2'>;
const seatKeys = ['a', 'b', 'a1', 'a2', 'b1', 'b2'] as const satisfies SeatKey[];
const seatsForMode = (doubles: boolean) => doubles ? (['a1', 'a2', 'b1', 'b2'] as const) : (['a', 'b'] as const);
type Player = { id: string; name: string };
type Pref = '8 foot' | '9 foot' | 'any';
type AuditEntry = { t: number; who?: string; type: string; note?: string };

const TEAM_PREFIX = 'team:';
const isTeam = (id?: string) => typeof id === 'string' && id.startsWith(TEAM_PREFIX);
const teamMembers = (id: string): [string, string] => {
  const raw = id.replace(TEAM_PREFIX, '');
  const [a, b] = raw.split('+');
  return [a, b] as [string, string];
};
const makeTeamId = (a: string, b: string) => `${TEAM_PREFIX}${[a, b].sort().join('+')}`;

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
  doubles?: boolean;
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
      doubles: false,
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
              a1: t?.a1 ?? t?.a,
              a2: t?.a2,
              b1: t?.b1 ?? t?.b,
              b2: t?.b2,
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
        doubles: !!raw.doubles,
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
    doubles: false,
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
  const [supportsDnD, setSupportsDnD] = useState<boolean>(true);
  const [lostMessage, setLostMessage] = useState<string | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');

  useEffect(() => {
    setSupportsDnD(true);
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
  const doublesEnabled = g.doubles ?? false;
  const prefs = g.prefs || {};
  const activeSeats = seatsForMode(doublesEnabled);

  const seatValue = (t: Table, key: SeatKey) => (t as any)[key] as string | undefined;
  const setSeatValue = (t: Table, key: SeatKey, pid?: string) => {
    (t as any)[key] = pid;
    if (key === 'a1' || key === 'a') { t.a = pid; t.a1 = pid; }
    if (key === 'b1' || key === 'b') { t.b = pid; t.b1 = pid; }
  };
  const seatValues = (t: Table, doubles: boolean) => seatsForMode(doubles).map(k => seatValue(t, k));
  const clearPidFromTables = (d: ListGame, pid: string) => {
    d.tables = d.tables.map(t => {
      const nt = { ...t } as Table;
      seatKeys.forEach(k => { if (seatValue(nt, k) === pid) setSeatValue(nt, k, undefined); });
      return nt;
    });
  };
  const seatedPids = useMemo(() => {
    const set = new Set<string>();
    g.tables.forEach(t => {
      seatKeys.forEach(key => {
        const val = seatValue(t, key);
        if (!val) return;
        set.add(val);
        if (isTeam(val)) teamMembers(val).forEach(m => set.add(m));
      });
    });
    return set;
  }, [g.tables]);
  const nameOf = (pid?: string) => {
    if (!pid) return '—';
    if (isTeam(pid)) {
      const [a, b] = teamMembers(pid);
      const na = players.find(p => p.id === a)?.name || '??';
      const nb = players.find(p => p.id === b)?.name || '??';
      return `${na} + ${nb}`;
    }
    return players.find(p => p.id === pid)?.name || '??';
  };
  const inQueue = (pid: string) => queue.some(q => q === pid || (isTeam(q) && teamMembers(q).includes(pid)));

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

    const entryMatchesTable = (entry: string, want: TableLabel) => {
      if (!entry) return false;
      if (!isTeam(entry)) {
        const pref = (pmap[entry] ?? 'any') as Pref;
        return pref === 'any' || pref === want;
      }

      const [a, b] = teamMembers(entry);
      const pa = (pmap[a] ?? 'any') as Pref;
      const pb = (pmap[b] ?? 'any') as Pref;
      return (pa === 'any' || pa === want) && (pb === 'any' || pb === want);
    };

    const takeFromQueue = (want: TableLabel) => {
      for (let i = 0; i < next.queue.length; i++) {
        const pid = next.queue[i];
        if (!pid) { next.queue.splice(i, 1); i--; continue; }
        if (excluded && pid === excluded) continue;
        if (entryMatchesTable(pid, want)) { next.queue.splice(i, 1); return pid; }
      }
      return undefined;
    };

    const fillFromPlayersIfNoQueue = false; // Require queue membership to auto-seat
    const seatOrder = seatsForMode(next.doubles ?? false);
    const seatedSet = new Set<string>();
    for (const t of next.tables) {
      seatKeys.forEach(sk => {
        const val = seatValue(t, sk);
        if (!val) return;
        seatedSet.add(val);
        if (isTeam(val)) teamMembers(val).forEach(m => seatedSet.add(m));
      });
    }
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
      seatOrder.forEach(sk => {
        if (!seatValue(t, sk)) setSeatValue(t, sk, takeFromQueue(t.label) ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined));
      });
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

  const addSelfToList = () => update(d => { ensureMe(d); }, { t: Date.now(), who: me.id, type: 'add-self' });
  
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

  const addTeamToQueue = () => {
    if (!doublesEnabled) return;
    const a = teamA.trim();
    const b = teamB.trim();
    if (!a || !b || a === b) return;
    enqueueTeam(a, b);
    setTeamA('');
    setTeamB('');
  };
  
  const removePlayer = (pid: string) => update(d => {
    d.players = d.players.filter(p => p.id !== pid);
    d.queue = d.queue.filter(x => x !== pid && !(isTeam(x) && teamMembers(x).includes(pid)));
    delete d.prefs[pid];
    clearPidFromTables(d, pid);
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

  const enqueueTeam = (pidA: string, pidB: string) => update(d => {
    const entry = makeTeamId(pidA, pidB);
    if (!d.queue.includes(entry)) d.queue.push(entry);
  }, { t: Date.now(), who: me.id, type: 'queue-team', note: `${nameOf(pidA)} + ${nameOf(pidB)}` });
  
  const dequeuePid = (pid: string) => update(d => {
    d.queue = d.queue.filter(x => x !== pid && !(isTeam(x) && teamMembers(x).includes(pid)));
  }, { t: Date.now(), who: me.id, type: 'dequeue', note: nameOf(pid) });

  const leaveList = () => update(d => {
    d.players = d.players.filter(p => p.id !== me.id);
    d.queue = d.queue.filter(x => x !== me.id && !(isTeam(x) && teamMembers(x).includes(me.id)));
    clearPidFromTables(d, me.id);
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

  // ✅ FIXED: iLost now removes player completely - no auto re-queue
  const iLost = (pid?: string) => {
    const loser = pid ?? me.id;
    const playerName = nameOf(loser);

    if (!confirm(`${playerName}, are you sure you lost?`)) return;
    const shouldQueue = confirm('Put yourself back in the queue?');

    if (!shouldQueue) {
      setLostMessage(`${playerName}, find your name in the Players list below and click "Queue" to rejoin.`);
      setTimeout(() => setLostMessage(null), 8000);
    }

    update(d => {
      const t = d.tables.find(tt => seatKeys.some(sk => seatValue(tt, sk) === loser));
      if (!t) return;
      seatKeys.forEach(sk => { if (seatValue(t, sk) === loser) setSeatValue(t, sk, undefined); });
      d.queue = d.queue.filter(x => {
        if (x === loser) return false;
        if (!isTeam(x)) return true;
        if (isTeam(loser)) return !teamMembers(x).some(id => teamMembers(loser).includes(id));
        return !teamMembers(x).includes(loser);
      });
      if (shouldQueue && !d.queue.includes(loser)) d.queue.push(loser);
      excludeSeatPidRef.current = loser;
    }, { t: Date.now(), who: me.id, type: 'lost', note: playerName });
  };

  type DragInfo =
    | { type: 'seat'; table: number; side: SeatKey; pid?: string }
    | { type: 'queue'; index: number; pid: string }
    | { type: 'player'; pid: string }
    | { type: 'bench' };

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
        clearPidFromTables(d, pid);
      };

      const placeSeat = (ti: number, side: SeatKey, pid?: string) => {
        if (!pid) return;
        removeEverywhere(pid);
        setSeatValue(d.tables[ti], side, pid);
      };

      if (target.type === 'seat') {
        if (src.type === 'seat') {
          const sp = seatValue(d.tables[src.table], src.side), tp = seatValue(d.tables[target.table], target.side);
          setSeatValue(d.tables[src.table], src.side, tp);
          setSeatValue(d.tables[target.table], target.side, sp);
        } else if (src.type === 'queue') {
          d.queue = d.queue.filter(x => x !== src.pid);
          placeSeat(target.table, target.side, src.pid);
        } else if (src.type === 'player') {
          placeSeat(target.table, target.side, src.pid);
        }
      } else if (target.type === 'queue') {
        if (src.type === 'queue') d.queue = moveWithin(d.queue, src.index, target.index);
        else if (src.type === 'seat') {
          const pid = seatValue(d.tables[src.table], src.side);
          setSeatValue(d.tables[src.table], src.side, undefined);
          if (pid) d.queue.splice(target.index, 0, pid);
        } else if (src.type === 'player') { if (!d.queue.includes(src.pid)) d.queue.splice(target.index, 0, src.pid); }
      } else if (target.type === 'bench') {
        if (src.type === 'seat') { const pid = seatValue(d.tables[src.table], src.side); setSeatValue(d.tables[src.table], src.side, undefined); removeEverywhere(pid ?? ''); }
        if (src.type === 'queue') { d.queue = d.queue.filter(x => x !== src.pid); }
      }
    });
  };

  const seatedIndex = g.tables.findIndex((t) => seatKeys.some(sk => seatValue(t, sk) === me.id));
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
          {!players.some(p => p.id === me.id) && (
            <button style={btnGhost} onClick={addSelfToList} disabled={busy}>Add me as "{me.name}"</button>
          )}
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
              <button
                style={btnGhostSm}
                onClick={()=>update(d=>{ if (d.tables.length<2) d.tables.push({label:d.tables[0]?.label==="9 foot"?'8 foot':'9 foot'}); })}
                disabled={busy||g.tables.length>=2 || !iHaveMod}
              >Add second table</button>
              <button
                style={btnGhostSm}
                onClick={()=>update(d=>{ if (d.tables.length>1) d.tables=d.tables.slice(0,1); })}
                disabled={busy||g.tables.length<=1 || !iHaveMod}
              >Use one table</button>
            </div>
            <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,fontWeight:600}}>
              <input
                type="checkbox"
                checked={!!doublesEnabled}
                onChange={(e)=>{
                  const target = e.target as HTMLInputElement | null;
                  const next = !!target?.checked;
                  update(d=>{
                    d.doubles = next;
                    d.tables = d.tables.map(t => {
                      const tt = { ...t } as Table;
                      if (next) {
                        if (!tt.a1 && tt.a) tt.a1 = tt.a;
                        if (!tt.b1 && tt.b) tt.b1 = tt.b;
                      } else {
                        tt.a = tt.a1 || tt.a;
                        tt.b = tt.b1 || tt.b;
                        tt.a1 = tt.a;
                        tt.b1 = tt.b;
                        tt.a2 = undefined;
                        tt.b2 = undefined;
                      }
                      return tt;
                    });
                  });
                }}
                disabled={busy || !iHaveMod}
              />
              Enable doubles (teams of two)
            </label>
          </div>
        )}

        <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px,1fr))', gap:12}}>
          {g.tables.map((t,i)=>{
            const Seat = ({side,label}:{side:SeatKey;label:string})=>{
              const pid = seatValue(t, side);
              return (
                <div
                  draggable={!!pid && iHaveMod && supportsDnD}
                  onDragStart={(e)=>pid && onDragStart(e,{type:'seat',table:i,side,pid})}
                  onDragOver={supportsDnD ? onDragOver : undefined}
                  onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'seat',table:i,side,pid}) : undefined}
                  style={{minHeight:36,padding:'12px 12px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:10,background:doublesEnabled?'rgba(124,58,237,.16)':'rgba(56,189,248,.10)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8, boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)'}}
                  title={supportsDnD ? 'Drag from queue, players, or swap seats' : 'Use Queue controls'}
                >
                  <span style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={dragHandleMini} aria-hidden>⋮</span>
                    <span style={{opacity:.7,fontSize:13,fontWeight:600}}>{label}</span>
                    <span style={{fontSize:15}}>{nameOf(pid)}</span>
                  </span>
                  {pid && (iHaveMod || pid===me.id) && <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>}
                </div>
              );
            };
            return (
              <div key={i} style={{ background:doublesEnabled?'#432775':'#0b3a66', color:'#fff', borderRadius:12, padding:'12px 14px', border:doublesEnabled?'1px solid rgba(168,85,247,.45)':'1px solid rgba(56,189,248,.35)', display:'grid', gap:10, fontSize:15, lineHeight:1.4}}>
                <div style={{ opacity:.9, fontSize:13, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'space-between' }}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span>{t.label==='9 foot'?'9-Foot Table':'8-Foot Table'} • Table {i+1}</span>
                    {doublesEnabled && <span style={pillBadge}>Doubles</span>}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button
                      style={btnGhostSm}
                      onClick={() =>
                        update(
                          d => {
                            const tt = d.tables[i];
                            ([['a','b'],['a1','b1'],['a2','b2']] as [SeatKey,SeatKey][]).forEach(([l,r]) => {
                              const lv = seatValue(tt, l);
                              const rv = seatValue(tt, r);
                              setSeatValue(tt, l, rv);
                              setSeatValue(tt, r, lv);
                            });
                          },
                          { t: Date.now(), who: me.id, type: 'swap-sides', note: `Table ${i+1}` },
                        )
                      }
                      disabled={busy || !iHaveMod}
                    >
                      Swap sides
                    </button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'stretch',gap:10}}>
                  <div style={{display:'grid',gap:8}}>
                    <Seat side={doublesEnabled ? 'a1' : 'a'} label={doublesEnabled ? 'Left L1' : 'Player'} />
                    {doublesEnabled && <Seat side='a2' label='Left L2' />}
                  </div>
                  <div style={{opacity:.7,textAlign:'center',fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>vs</div>
                  <div style={{display:'grid',gap:8}}>
                    <Seat side={doublesEnabled ? 'b1' : 'b'} label={doublesEnabled ? 'Right R1' : 'Player'} />
                    {doublesEnabled && <Seat side='b2' label='Right R2' />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div
          onDragOver={supportsDnD ? onDragOver : undefined}
          onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'bench'}) : undefined}
          style={{marginTop:10,padding:'10px 12px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:12,opacity:.75,fontSize:13,display:'flex',alignItems:'center',gap:10}}
        >
          <span style={dragHandleMini} aria-hidden>⋮</span>
          Drop here to clear a seat or remove from queue
        </div>
      </section>

      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
          {iHaveMod && queue.length >= 2 && (
            <button style={btnGhostSm} onClick={skipFirst} disabled={busy} title="Move #1 below #2">Skip first</button>
          )}
        </div>

        {doublesEnabled && iHaveMod && players.length >= 2 && (
          <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginBottom:10}}>
            <div style={{opacity:.8,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
              <span style={dragHandleMini} aria-hidden>⋮</span>
              Queue a doubles team:
            </div>
            <select value={teamA} onChange={(e)=>setTeamA(e.target.value)} style={select} disabled={busy}>
              <option value="">Player A</option>
              {players.map(p=>(<option key={`ta-${p.id}`} value={p.id}>{p.name}</option>))}
            </select>
            <select value={teamB} onChange={(e)=>setTeamB(e.target.value)} style={select} disabled={busy}>
              <option value="">Player B</option>
              {players.map(p=>(<option key={`tb-${p.id}`} value={p.id}>{p.name}</option>))}
            </select>
            <button
              style={btnGhostSm}
              onClick={addTeamToQueue}
              disabled={busy || !teamA || !teamB || teamA===teamB}
              title="Add two players as a team"
            >Add doubles</button>
          </div>
        )}

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
                  <span style={dragHandle} aria-hidden>⋮⋮</span>
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
        <div style={{opacity:.75,fontSize:13,marginBottom:8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={dragHandleMini} aria-hidden>⋮</span>
          Drag a player onto a table side to seat them, or onto the queue to line them up.
        </div>
        {players.length===0 ? <div style={{opacity:.7}}>No players yet.</div> : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {players.map(p=>{
              const pref = (prefs[p.id] ?? 'any') as Pref;
              const canEditSelf = p.id===me.id;
              const isCohost = (g.cohosts ?? []).includes(p.id);
              const isSeated = seatedPids.has(p.id);
              const status = isSeated ? 'table' : (inQueue(p.id) ? 'queue' : 'idle');
              return (
                <li
                  key={p.id}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}
                  draggable={supportsDnD && iHaveMod}
                  onDragStart={supportsDnD && iHaveMod ? (e)=>onDragStart(e,{type:'player',pid:p.id}) : undefined}
                  onDragOver={supportsDnD ? onDragOver : undefined}
                  onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'queue',index:queue.length,pid:p.id}) : undefined}
                >
                  <span style={{display:'flex',alignItems:'center',gap:8}}>
                    <span>{p.name}{isCohost ? <em style={{opacity:.6,marginLeft:8}}>(Cohost)</em> : null}</span>
                    <span style={{fontSize:11,opacity:.65,padding:'3px 8px',borderRadius:999,border:'1px solid rgba(255,255,255,.18)'}}>
                      {status}
                    </span>
                  </span>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {!inQueue(p.id)
                      ? (iHaveMod ? <button style={btnMini} onClick={()=>enqueuePid(p.id)} disabled={busy || isSeated}>Queue</button> : null)
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
  background: 'linear-gradient(120deg, rgba(255,255,255,.08), rgba(14,165,233,.08))',
  cursor: 'grab',
  userSelect: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
};
const queueItem: React.CSSProperties = {
  cursor:'grab',
  display:'flex',
  alignItems:'center',
  gap:10,
  justifyContent:'space-between'
};
const dragHandle: React.CSSProperties = {
  display:'inline-flex',
  alignItems:'center',
  justifyContent:'center',
  width:28,
  height:28,
  borderRadius:10,
  background:'rgba(255,255,255,0.06)',
  border:'1px solid rgba(255,255,255,0.15)',
  fontWeight:700,
  color:'rgba(255,255,255,0.65)',
};
const dragHandleMini: React.CSSProperties = {
  display:'inline-flex',
  alignItems:'center',
  justifyContent:'center',
  width:22,
  height:22,
  borderRadius:8,
  background:'rgba(255,255,255,0.06)',
  border:'1px solid rgba(255,255,255,0.12)',
  color:'rgba(255,255,255,0.65)',
  fontSize:12,
};