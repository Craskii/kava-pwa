'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { uid } from '@/lib/storage';

/* ---------- types ---------- */
type TableLabel = '8 foot'|'9 foot';
type Table = { a?:string; b?:string; label:TableLabel };
type Player = { id:string; name:string };
type Pref = '8 foot'|'9 foot'|'any';
type ListGame = {
  id:string; name:string; code?:string; hostId:string;
  status:'active'; createdAt:number;
  tables:Table[]; players:Player[];
  queue:string[]; prefs?:Record<string,Pref>;
  v?:number; schema?:'v2';
};

/* ---------- globals ---------- */
type KavaGlobals = {
  streams: Record<string,{ es:EventSource|null; refs:number; backoff:number }>;
  heartbeats: Record<string,{ t:number|null; refs:number }>;
  visHook:boolean;
};
function getGlobals():KavaGlobals{
  const any = globalThis as any;
  if(!any.__kava_globs) any.__kava_globs = { streams:{}, heartbeats:{}, visHook:false } as KavaGlobals;
  return any.__kava_globs;
}

/* ---------- helpers ---------- */
function coerceList(raw:any):ListGame|null{
  if(!raw) return null;
  try{
    const tables:Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t:any,i:number)=>({ a:t?.a?String(t.a):undefined, b:t?.b?String(t.b):undefined, label:(t?.label==='9 foot'||t?.label==='8 foot')?t.label:(i===1?'9 foot':'8 foot') }))
      : [{label:'8 foot'},{label:'9 foot'}];

    const players:Player[] = Array.isArray(raw.players)
      ? raw.players.map((p:any)=>({ id:String(p?.id??''), name:String(p?.name??'Player') }))
      : [];

    const queue:string[] = Array.isArray(raw.queue) ? raw.queue.map((x:any)=>String(x)).filter(Boolean) : [];

    const prefs:Record<string,Pref> = {};
    if (raw.prefs && typeof raw.prefs==='object') {
      for (const [pid,v] of Object.entries(raw.prefs)) prefs[pid] = (v==='9 foot'||v==='8 foot') ? v as Pref : 'any';
    }

    return {
      id:String(raw.id??''), name:String(raw.name??'Untitled'), code:raw.code?String(raw.code):undefined,
      hostId:String(raw.hostId??''), status:'active', createdAt:Number(raw.createdAt??Date.now()),
      tables, players, queue, prefs, v:Number.isFinite(raw.v)?Number(raw.v):0, schema:'v2'
    };
  }catch{ return null; }
}

async function getList(id:string){
  const r = await fetch(`/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`, { cache:'no-store' });
  if(!r.ok) throw new Error(`get ${r.status}`);
  return coerceList(await r.json());
}

async function putListOnce(doc:ListGame, ifMatch?:number){
  const res = await fetch(`/api/list/${encodeURIComponent(doc.id)}`, {
    method:'PUT',
    headers:{ 'content-type':'application/json', ...(Number.isFinite(ifMatch!)?{'if-match':String(ifMatch)}:{}) },
    body: JSON.stringify({ ...doc, schema:'v2' }),
  });
  return res;
}

/** PUT with 412-aware retry: if conflict, fetch latest, merge our intent, retry once */
async function putListReliable(intent:ListGame, prevV:number){
  // First attempt with If-Match (fast path)
  let res = await putListOnce(intent, prevV);
  if (res.status !== 412) return res;

  // Conflict → fetch latest, merge, and retry
  const latest = await getList(intent.id);
  if(!latest) throw new Error('missing latest');

  const merged:ListGame = {
    ...latest,
    // apply our intended changes on top (fields we own on this screen)
    name: intent.name,
    players: intent.players,
    tables: intent.tables,
    queue: intent.queue,
    prefs: intent.prefs,
    // bump v; server will bump again
    v: (latest.v ?? 0) + 1,
    schema:'v2',
  };

  res = await putListOnce(merged, latest.v ?? undefined);
  return res;
}

/* ---------- component ---------- */
export default function ListLobby(){
  const params = useParams<{id:string}>();
  const id = decodeURIComponent(String(params?.id??''));

  const [g, setG] = useState<ListGame|null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');
  const [showTableControls, setShowTableControls] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  const me = useMemo<Player>(()=>{
    try{ return JSON.parse(localStorage.getItem('kava_me')||'null') || { id:uid(), name:'Player' }; }
    catch{ return { id:uid(), name:'Player' }; }
  },[]);
  useEffect(()=>{ localStorage.setItem('kava_me', JSON.stringify(me)); },[me]);

  useQueueAlerts({
    listId: id,
    upNextMessage: 'your up next get ready!!',
    matchReadyMessage: (s:any)=>{
      const raw = s?.tableNumber ?? s?.table?.number ?? null;
      const n = Number(raw); const shown = Number.isFinite(n) ? (n===0||n===1? n+1 : n) : null;
      return shown ? `Your in table (#${shown})` : 'Your in table';
    },
  });

  const lastSeatSig = useRef('');             // changes -> bump alerts
  const lastVersion = useRef(0);
  const excludeSeatPidRef = useRef<string|null>(null);
  const commitQ = useRef<(() => Promise<void>)[]>([]);
  const suppressRef = useRef(false);
  const watchRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const pageRootRef = useRef<HTMLDivElement|null>(null);
  const pollRef = useRef<number|null>(null);
  const triedFirstFetch = useRef(false);

  const seatChanged = (next:ListGame|null)=>{
    if(!next) return false;
    const i = next.tables.findIndex(t=>t.a===me.id || t.b===me.id);
    if(i<0){ if(lastSeatSig.current){ lastSeatSig.current=''; return true; } return false; }
    const t = next.tables[i]; const sig = `t${i}-${t.a??'x'}-${t.b??'x'}`;
    if(sig!==lastSeatSig.current){ lastSeatSig.current=sig; return true; }
    return false;
  };

  /* ------------ SSE + poll ------------ */
  useEffect(()=>{
    if(!id || id==='create'){
      setG(null); setErr(id==='create'?'Waiting for a new list id…':null); return;
    }
    const gl = getGlobals();
    if(!gl.streams[id]) gl.streams[id] = { es:null, refs:0, backoff:1000 };
    gl.streams[id].refs++; setErr(null); lastVersion.current=0; triedFirstFetch.current=false;

    const startPoller = ()=>{
      if(pollRef.current) return;
      pollRef.current = window.setInterval(async ()=>{
        try{
          const res = await fetch(`/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`, { cache:'no-store' });
          if(!res.ok) return;
          const doc = coerceList(await res.json()); if(!doc) return;
          const v = doc.v??0; if(v<=lastVersion.current) return;
          lastVersion.current=v; setErr(null); setG(doc); if(seatChanged(doc)) bumpAlerts();
        }catch{}
      }, 3000);
    };
    const stopPoller = ()=>{ if(pollRef.current){ clearInterval(pollRef.current); pollRef.current=null; } };

    const attach = ()=>{
      const s = gl.streams[id]; if(s.es) return;
      const es = new EventSource(`/api/list/${encodeURIComponent(id)}/stream`); s.es=es;
      es.onmessage = e=>{
        if(suppressRef.current) return;
        try{
          const doc = coerceList(JSON.parse(e.data)); if(!doc||!doc.id||!doc.hostId) return;
          const v = doc.v??0; if(v<=lastVersion.current) return;
          lastVersion.current=v; stopPoller(); setErr(null); setG(doc); if(seatChanged(doc)) bumpAlerts();
        }catch{}
      };
      es.onerror = ()=>{
        try{ es.close(); }catch{}; s.es=null;
        const d = Math.min(15000, s.backoff); s.backoff = Math.min(15000, s.backoff*2);
        startPoller(); setTimeout(()=>{ if(gl.streams[id]?.refs) attach(); }, d);
      };
      s.backoff=1000;
    };

    (async ()=>{
      triedFirstFetch.current = true;
      try{
        const res = await fetch(`/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`, { cache:'no-store' });
        if(!res.ok){
          setErr(res.status===404? 'List not found yet (404). If you just created it, give it a moment.':'Failed to load list. Retrying…');
          startPoller(); attach(); return;
        }
        const doc = coerceList(await res.json()); if(!doc){ setErr('Invalid list data'); startPoller(); attach(); return; }
        lastVersion.current = doc.v??0; setErr(null); setG(doc); attach();
      }catch(e){ setErr('Network error loading list. Retrying…'); startPoller(); attach(); }
    })();

    /* heartbeats */
    const hbKey = `hb:${id}:${me.id}`;
    if(!gl.heartbeats[hbKey]) gl.heartbeats[hbKey] = { t:null, refs:0 };
    gl.heartbeats[hbKey].refs++;
    if(gl.heartbeats[hbKey].t){ clearTimeout(gl.heartbeats[hbKey].t as number); gl.heartbeats[hbKey].t=null; }

    const HEARTBEAT_MS = 25_000;
    const sendHeartbeat = ()=>{
      const url = `/api/me/status?userId=${encodeURIComponent(me.id)}&listId=${encodeURIComponent(id)}&ts=${Date.now()}`;
      try{ fetch(url,{method:'GET', keepalive:true, cache:'no-store'}).catch(()=>{}); }catch{ const img=new Image(); img.src=url; }
      gl.heartbeats[hbKey].t = window.setTimeout(sendHeartbeat, HEARTBEAT_MS);
    };
    gl.heartbeats[hbKey].t = window.setTimeout(sendHeartbeat, 500);

    /* visibility: close SSE when hidden, reopen when visible */
    if(!gl.visHook){
      gl.visHook=true;
      document.addEventListener('visibilitychange', ()=>{
        const hidden = document.visibilityState==='hidden';
        const g1 = getGlobals();
        for (const [lid, rec] of Object.entries(g1.streams)){
          if(!rec.refs) continue;
          if(hidden){ if(rec.es){ try{rec.es.close();}catch{} rec.es=null; } }
          else if(!rec.es){
            const es = new EventSource(`/api/list/${encodeURIComponent(lid)}/stream`); rec.es=es;
            es.onmessage = (e)=>{
              if(suppressRef.current) return;
              try{
                const doc = coerceList(JSON.parse(e.data)); if(!doc||!doc.id||!doc.hostId) return;
                const v = doc.v??0; if(v<=lastVersion.current) return;
                lastVersion.current=v; setG(prev=>doc.id===prev?.id?doc:doc); setErr(null); if(seatChanged(doc)) bumpAlerts();
              }catch{}
            };
            es.onerror = ()=>{ try{es.close();}catch{}; rec.es=null; };
          }
        }
      });
    }

    return ()=>{
      const s = gl.streams[id]; if(s){ s.refs--; if(s.refs<=0){ if(s.es){ try{s.es.close();}catch{} } delete gl.streams[id]; } }
      const hb = gl.heartbeats[hbKey]; if(hb){ hb.refs--; if(hb.refs<=0){ if(hb.t) clearTimeout(hb.t as number); delete gl.heartbeats[hbKey]; } }
      if(pollRef.current){ clearInterval(pollRef.current); pollRef.current=null; }
    };
  },[id, me.id]);

  /* ---- Disable long-press (Android/iPad) ---- */
  useEffect(()=>{
    const root = pageRootRef.current; if(!root) return;
    const prevent = (e:Event)=>{
      const t = e.target as HTMLElement|null;
      if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
      e.preventDefault();
    };
    root.addEventListener('contextmenu', prevent);
    return ()=>{ root.removeEventListener('contextmenu', prevent); };
  },[]);

  /* ---- fast queue-only save (keepalive + beacon) ---- */
  const fastSaveQueue = (queue:string[])=>{
    const url = `/api/list/${encodeURIComponent(id)}/queue`;
    const body = JSON.stringify({ queue });
    try{
      fetch(url, { method:'POST', body, headers:{'content-type':'application/json'}, keepalive:true }).catch(()=>{});
    }catch{
      try{ navigator.sendBeacon(url, new Blob([body], {type:'application/json'})); }catch{}
    }
  };

  // persist queue on page hide (covers Back nav)
  useEffect(()=>{
    const onHide = ()=>{ if(!g) return; fastSaveQueue(g.queue); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') onHide(); });
    return ()=>{ window.removeEventListener('pagehide', onHide); };
  },[g?.id, g?.queue?.join(',')]);

  /* ---- early UI ---- */
  if(!id || id==='create' || !g){
    return (
      <main ref={pageRootRef} style={wrap}>
        <BackButton href="/" />
        <p style={{opacity:.7}}>Loading…</p>
        {err && <p style={{opacity:.7, marginTop:6, fontSize:13}}>{err}</p>}
      </main>
    );
  }

  const iAmHost = me.id===g.hostId;
  const queue = g.queue;
  const prefs = g.prefs || {};
  const players = g.players;
  const seatedIndex = g.tables.findIndex(t=>t.a===me.id || t.b===me.id);
  const seated = seatedIndex>=0;
  const nameOf = (pid?:string)=> (pid ? players.find(p=>p.id===pid)?.name || '??' : '—');
  const inQueue = (pid:string)=> queue.includes(pid);

  /* ---- auto seat ---- */
  function autoSeat(next:ListGame){
    const excluded = excludeSeatPidRef.current;
    const pmap = next.prefs || {};
    const take = (want:TableLabel)=>{
      for (let i=0;i<next.queue.length;i++){
        const pid = next.queue[i]; if(!pid){ next.queue.splice(i,1); i--; continue; }
        if(excluded && pid===excluded) continue;
        const pref = (pmap[pid]??'any') as Pref;
        if (pref==='any' || pref===want){ next.queue.splice(i,1); return pid; }
      }
      return undefined;
    };
    next.tables.forEach((t)=>{
      if(!t.a){ const p=take(t.label); if(p) t.a=p; }
      if(!t.b){ const p=take(t.label); if(p) t.b=p; }
    });
    excludeSeatPidRef.current=null;
  }

  /* ---- commit queue/list (serial) ---- */
  async function runNext(){ const job = commitQ.current.shift(); if(!job) return; await job(); if(commitQ.current.length) runNext(); }
  function scheduleCommit(mut:(draft:ListGame)=>void, fastQueueOnly=false){
    commitQ.current.push(async ()=>{
      if(!g) return;
      const next:ListGame = JSON.parse(JSON.stringify(g));
      const prevV = Number(next.v)||0;
      next.v = prevV + 1; lastVersion.current = next.v!;
      mut(next);
      autoSeat(next);

      suppressRef.current=true; setBusy(true);
      if (watchRef.current) clearTimeout(watchRef.current);
      watchRef.current = setTimeout(()=>{ setBusy(false); suppressRef.current=false; }, 8000);

      try{
        setG(next);

        if(fastQueueOnly){
          // for queue-only tweaks we avoid full PUT (prevents version races)
          fastSaveQueue(next.queue);
        }else{
          const res = await putListReliable(next, prevV);
          if (!res.ok && res.status !== 204) {
            console.warn('PUT failed', res.status);
          }
        }
        if(seatChanged(next)) bumpAlerts();
      }catch(e){ console.error('save-failed', e); }
      finally{
        if(watchRef.current){ clearTimeout(watchRef.current); watchRef.current=null; }
        setBusy(false); suppressRef.current=false;
      }
    });
    if(commitQ.current.length===1) runNext();
  }

  /* ---- actions ---- */
  const renameList   = (nm:string)=>{ const v=nm.trim(); if(!v) return; scheduleCommit(d=>{ d.name=v; }); };
  const ensureMe     = (d:ListGame)=>{ if(!d.players.some(p=>p.id===me.id)) d.players.push(me); d.prefs??={}; if(!d.prefs[me.id]) d.prefs[me.id]='any'; };
  const joinQueue    = ()=> scheduleCommit(d=>{ ensureMe(d); if(!d.queue.includes(me.id)) d.queue.push(me.id); }, true);
  const leaveQueue   = ()=> scheduleCommit(d=>{ d.queue = d.queue.filter(x=>x!==me.id); }, true);
  const addPlayer    = ()=>{ const v=nameField.trim(); if(!v) return; setNameField(''); const p:Player={id:uid(),name:v}; scheduleCommit(d=>{ d.players.push(p); d.prefs??={}; d.prefs[p.id]='any'; if(!d.queue.includes(p.id)) d.queue.push(p.id); }); };
  const removePlayer = (pid:string)=> scheduleCommit(d=>{ d.players=d.players.filter(p=>p.id!==pid); d.queue=d.queue.filter(x=>x!==pid); if(d.prefs) delete d.prefs[pid]; d.tables=d.tables.map(t=>({...t, a:t.a===pid?undefined:t.a, b:t.b===pid?undefined:t.b })); });
  const renamePlayer = (pid:string)=>{ const cur=players.find(p=>p.id===pid)?.name||''; const nm=prompt('Rename player',cur); if(!nm) return; const v=nm.trim(); if(!v) return; scheduleCommit(d=>{ const p=d.players.find(pp=>pp.id===pid); if(p) p.name=v; }); };
  const setPrefFor   = (pid:string,pref:Pref)=> scheduleCommit(d=>{ d.prefs??={}; d.prefs[pid]=pref; });
  const enqueuePid   = (pid:string)=> scheduleCommit(d=>{ if(!d.queue.includes(pid)) d.queue.push(pid); }, true);
  const dequeuePid   = (pid:string)=> scheduleCommit(d=>{ d.queue = d.queue.filter(x=>x!==pid); }, true);

  // Skip first: swap #1 and #2 (fast queue-only)
  const skipFirst    = ()=> scheduleCommit(d=>{ if(d.queue.length>=2){ const [a,b,...rest]=d.queue; d.queue=[b,a,...rest]; } }, true);

  const iLost = (pid?:string)=>{
    const loser = pid ?? me.id;
    scheduleCommit(d=>{
      const t = d.tables.find(tt=>tt.a===loser || tt.b===loser);
      if(!t) return;
      if(t.a===loser) t.a=undefined;
      if(t.b===loser) t.b=undefined;
      d.queue = d.queue.filter(x=>x!==loser);
      d.queue.push(loser);
      excludeSeatPidRef.current = loser;
    });
  };

  /* ---- drag & drop + touch arrows fallback ---- */
  const isTouch = typeof window!=='undefined' && matchMedia('(pointer: coarse)').matches;

  const moveUp   = (idx:number)=> scheduleCommit(d=>{ if(idx<=0||idx>=d.queue.length) return; const q=[...d.queue]; const t=q[idx-1]; q[idx-1]=q[idx]; q[idx]=t; d.queue=q; }, true);
  const moveDown = (idx:number)=> scheduleCommit(d=>{ if(idx<0||idx>=d.queue.length-1) return; const q=[...d.queue]; const t=q[idx+1]; q[idx+1]=q[idx]; q[idx]=t; d.queue=q; }, true);

  type DragInfo = { type:'seat'; table:number; side:'a'|'b'; pid?:string } | { type:'queue'; index:number; pid:string };
  const onDragStart = (e:React.DragEvent, info:DragInfo)=>{ if(isTouch) return; e.dataTransfer.setData('application/json', JSON.stringify(info)); e.dataTransfer.effectAllowed='move'; };
  const onDragOver  = (e:React.DragEvent)=>{ if(!isTouch) e.preventDefault(); };
  const parseInfo   = (ev:React.DragEvent):DragInfo|null=>{ try{ return JSON.parse(ev.dataTransfer.getData('application/json')); }catch{ return null; } };
  const handleDrop  = (ev:React.DragEvent, target:DragInfo)=>{
    if(isTouch) return;
    ev.preventDefault();
    const src = parseInfo(ev); if(!src) return;
    scheduleCommit(d=>{
      const moveWithin = (arr:string[],from:number,to:number)=>{ const a=[...arr]; const [p]=a.splice(from,1); a.splice(Math.max(0,Math.min(a.length,to)),0,p); return a; };
      const removeEverywhere = (pid:string)=>{ d.queue=d.queue.filter(x=>x!==pid); d.tables=d.tables.map(t=>({...t, a:t.a===pid?undefined:t.a, b:t.b===pid?undefined:t.b })); };
      const placeSeat = (ti:number, side:'a'|'b', pid?:string)=>{ if(!pid) return; removeEverywhere(pid); d.tables[ti][side]=pid; };

      if(target.type==='seat'){
        if(src.type==='seat'){ const sp=d.tables[src.table][src.side], tp=d.tables[target.table][target.side]; d.tables[src.table][src.side]=tp; d.tables[target.table][target.side]=sp; }
        else if(src.type==='queue'){ d.queue=d.queue.filter(x=>x!==src.pid); placeSeat(target.table,target.side,src.pid); }
      }else if(target.type==='queue'){
        if(src.type==='queue') d.queue = moveWithin(d.queue, src.index, target.index);
        else if(src.type==='seat'){ const pid=d.tables[src.table][src.side]; d.tables[src.table][src.side]=undefined; if(pid) d.queue.splice(target.index,0,pid); }
      }
    }, true);
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

      <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:6}}>
        <div>
          <h1 style={{ margin:'8px 0 4px' }}>
            <input defaultValue={g.name} onBlur={(e)=>renameList(e.currentTarget.value)} style={nameInput} disabled={busy}/>
          </h1>
          <div style={{ opacity:.8, fontSize:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            Private code: <b>{g.code || '—'}</b> • {g.players.length} {g.players.length===1?'player':'players'}
          </div>
        </div>
        <div style={{display:'grid',gap:6,justifyItems:'end'}}>
          {!seated && !g.queue.includes(me.id) && <button style={btn} onClick={joinQueue} disabled={busy}>Join queue</button>}
          {g.queue.includes(me.id) && <button style={btnGhost} onClick={leaveQueue} disabled={busy}>Leave queue</button>}
        </div>
      </header>

      {/* Tables */}
      <section style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{marginTop:0}}>Tables</h3>
          {me.id===g.hostId && <button style={btnGhostSm} onClick={()=>setShowTableControls(v=>!v)}>{showTableControls?'Hide table settings':'Table settings'}</button>}
        </div>

        {showTableControls && me.id===g.hostId && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginBottom:12}}>
            {g.tables.map((t,i)=>(
              <div key={i} style={{background:'#111',border:'1px solid #333',borderRadius:10,padding:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div style={{fontWeight:600,opacity:.9}}>Table {i+1}</div>
                  <select value={t.label} onChange={(e)=>scheduleCommit(d=>{ d.tables[i].label = e.currentTarget.value==='9 foot'?'9 foot':'8 foot'; })} style={select} disabled={busy}>
                    <option value="9 foot">9-foot</option><option value="8 foot">8-foot</option>
                  </select>
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button style={btnGhostSm} onClick={()=>scheduleCommit(d=>{ if(d.tables.length<2) d.tables.push({label:d.tables[0]?.label==='9 foot'?'8 foot':'9 foot'}); })} disabled={busy||g.tables.length>=2}>Add second table</button>
              <button style={btnGhostSm} onClick={()=>scheduleCommit(d=>{ if(d.tables.length>1) d.tables=d.tables.slice(0,1); })} disabled={busy||g.tables.length<=1}>Use one table</button>
            </div>
          </div>
        )}

        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:12}}>
          {g.tables.map((t,i)=>{
            const Seat = ({side}:{side:'a'|'b'})=>{
              const pid = t[side];
              return (
                <div
                  draggable={!!pid && me.id===g.hostId && !isTouch}
                  onDragStart={(e)=>pid && onDragStart(e,{type:'seat',table:i,side,pid})}
                  onDragOver={onDragOver}
                  onDrop={(e)=>handleDrop(e,{type:'seat',table:i,side,pid})}
                  style={{minHeight:24,padding:'8px 10px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:8,background:'rgba(56,189,248,.10)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}
                  title="Drag from queue or swap seats"
                >
                  <span>{nameOf(pid)}</span>
                  {pid && (me.id===g.hostId || pid===me.id) && <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>}
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
          {me.id===g.hostId && queue.length>=2 && <button style={btnGhostSm} onClick={skipFirst} disabled={busy} title="Move #1 below #2">Skip first</button>}
        </div>

        {queue.length===0 ? <div style={{opacity:.6,fontStyle:'italic'}}>Drop players here</div> : (
          <ol style={{margin:0,paddingLeft:18,display:'grid',gap:6}}
              onDragOver={onDragOver}
              onDrop={(e)=>handleDrop(e,{type:'queue',index:queue.length,pid:'__end' as any})}>
            {queue.map((pid,idx)=>{
              const pref = (prefs[pid]??'any') as Pref;
              const canEdit = me.id===g.hostId || pid===me.id;
              const isTouch = typeof window!=='undefined' && matchMedia('(pointer: coarse)').matches;

              return (
                <li key={`${pid}-${idx}`}
                    draggable={!isTouch}
                    onDragStart={(e)=>!isTouch && onDragStart(e,{type:'queue',index:idx,pid})}
                    onDragOver={onDragOver}
                    onDrop={(e)=>handleDrop(e,{type:'queue',index:idx,pid})}
                    style={{display:'flex',alignItems:'center',gap:10,justifyContent:'space-between',padding:'8px 10px',border:'1px solid rgba(255,255,255,.18)',borderRadius:12,background:'rgba(255,255,255,.06)'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:8}}>
                    <span style={{display:'inline-block',width:18,height:18,borderRadius:999,border:'2px solid rgba(255,255,255,.35)'}} />
                    <span>{nameOf(pid)}</span>
                  </span>

                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {isTouch && (
                      <>
                        <button style={btnTiny} onClick={(e)=>{e.stopPropagation(); moveUp(idx);}} disabled={busy || idx===0}>↑</button>
                        <button style={btnTiny} onClick={(e)=>{e.stopPropagation(); moveDown(idx);}} disabled={busy || idx===queue.length-1}>↓</button>
                      </>
                    )}
                    {canEdit ? (
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

      {/* Host controls */}
      {me.id===g.hostId && (
        <section style={card}>
          <h3 style={{marginTop:0}}>Host controls</h3>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
            <input placeholder="Add player name..." value={nameField} onChange={(e)=>setNameField(e.target.value)} style={input} disabled={busy}/>
            <button style={btn} onClick={addPlayer} disabled={busy || !nameField.trim()}>Add player (joins queue)</button>
          </div>
        </section>
      )}

      {/* Players */}
      <section style={card}>
        <h3 style={{marginTop:0}}>List (Players) — {players.length}</h3>
        {players.length===0 ? <div style={{opacity:.7}}>No players yet.</div> : (
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
            {players.map(p=>{
              const pref = (prefs[p.id]??'any') as Pref;
              const canEdit = me.id===g.hostId || p.id===me.id;
              return (
                <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                  <span>{p.name}</span>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {!inQueue(p.id)
                      ? <button style={btnMini} onClick={()=>enqueuePid(p.id)} disabled={busy}>Queue</button>
                      : <button style={btnMini} onClick={()=>dequeuePid(p.id)} disabled={busy}>Dequeue</button>}
                    {canEdit && (
                      <div style={{display:'flex',gap:6}}>
                        <button style={pref==='any'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'any')} disabled={busy}>Any</button>
                        <button style={pref==='9 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'9 foot')} disabled={busy}>9-ft</button>
                        <button style={pref==='8 foot'?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,'8 foot')} disabled={busy}>8-ft</button>
                      </div>
                    )}
                    <button style={btnMini} onClick={()=>renamePlayer(p.id)} disabled={busy}>Rename</button>
                    <button style={btnGhost} onClick={()=>removePlayer(p.id)} disabled={busy}>Remove</button>
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
const wrap:React.CSSProperties={ minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui', WebkitTouchCallout:'none' };
const card:React.CSSProperties={ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:14 };
const btn:React.CSSProperties={ padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost:React.CSSProperties={ padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnGhostSm:React.CSSProperties={ padding:'6px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontWeight:600 };
const btnMini:React.CSSProperties={ padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
const btnTiny:React.CSSProperties={ padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12, lineHeight:1 };
const btnTinyActive:React.CSSProperties={ ...btnTiny, background:'#0ea5e9', border:'none' };
const pillBadge:React.CSSProperties={ padding:'6px 10px', borderRadius:999, background:'rgba(16,185,129,.2)', border:'1px solid rgba(16,185,129,.35)', fontSize:12 };
const input:React.CSSProperties={ width:260, maxWidth:'90vw', padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' } as any;
const nameInput:React.CSSProperties={ background:'#111', border:'1px solid #333', color:'#fff', borderRadius:10, padding:'8px 10px', width:'min(420px, 80vw)' };
const select:React.CSSProperties={ background:'#111', border:'1px solid #333', color:'#fff', borderRadius:8, padding:'6px 8px' };
