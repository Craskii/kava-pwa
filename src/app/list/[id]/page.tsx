'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import {
  ListGame,
  Player,
  saveListRemote,
  getListRemote,
  deleteListRemote,
  uid,
  listSetTables,
  listJoin,
  listILost,
  listLeave,
} from '../../../lib/storage';
import { startSmartPoll } from '../../../lib/poll';

export default function ListLobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [g, setG] = useState<ListGame | null>(null);
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); }
    catch { return null; }
  }, []);

  useEffect(() => {
    if (!id) return;
    pollRef.current?.stop();
    const poll = startSmartPoll(async () => {
      const res = await fetch(`/api/list/${id}`, { cache: 'no-store' });
      if (res.status === 404 || res.status === 410) {
        r.push('/');
        r.refresh();
        return null;
      }
      if (res.ok) {
        const vHeader = res.headers.get('x-l-version') || '';
        const next = await res.json();
        const v = Number(vHeader);
        setG({ ...next, v: Number.isFinite(v) ? v : (next.v ?? 0) }); // ✅ carry server version
        return vHeader;
      }
      return null;
    });
    pollRef.current = poll;
    return () => poll.stop();
  }, [id, r]);

  if (!g) {
    return (
      <main style={wrap}>
        <div style={container}>
          <BackButton href="/" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }

  const isHost = me?.id === g.hostId;

  async function update(mut: (x: ListGame) => void) {
    const copy: ListGame = { ...g, tables: g.tables.map(t => ({ ...t })), queue: [...g.queue], players: [...g.players] };
    mut(copy);
    const saved = await saveListRemote(copy);
    setG(saved);
    pollRef.current?.bump?.();
  }

  function setTables(n: 1 | 2) { listSetTables(g, n).then(setG); }
  function join(name?: string) {
    const nm = (name || me?.name || 'Player').trim();
    const pid = me?.id || uid();
    listJoin(g, { id: pid, name: nm } as Player).then(setG);
  }
  function iLost(tableIndex: number) { if (!me) return; listILost(g, tableIndex, me.id).then(setG); }
  async function leaveOrDelete() {
    if (isHost) {
      if (confirm('Delete this list room?')) { await deleteListRemote(g.id); r.push('/'); r.refresh(); }
    } else if (me) { listLeave(g, me.id).then(()=>{ r.push('/me'); r.refresh(); }); }
  }

  return (
    <main style={wrap}>
      <div style={container}>
        <BackButton href="/" />

        <header style={header}>
          <div>
            <h1 style={h1}>{g.name}</h1>
            <div style={{ opacity: .8, fontSize: 14 }}>
              {g.code ? <>Private code: <b>{g.code}</b></> : 'Public'} • {g.players.length} players
            </div>
          </div>
          <div><button style={btnGhost} onClick={leaveOrDelete}>{isHost ? 'Delete' : 'Leave'}</button></div>
        </header>

        {isHost && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Host controls</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={g.tables.length === 1 ? btnPrimary : btnGhost} onClick={() => setTables(1)}>1 Table</button>
              <button style={g.tables.length === 2 ? btnPrimary : btnGhost} onClick={() => setTables(2)}>2 Tables</button>
              <button style={btnGhost} onClick={() => join('Guest ' + (g.players.length + 1))}>+ Add test player</button>
            </div>
          </div>
        )}

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Queue</h3>
          {g.queue.length === 0 ? (
            <div style={{ opacity: .7, fontSize: 13 }}>No one in queue.</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {g.queue.map((pid, i) => {
                const p = g.players.find(pp => pp.id === pid);
                return <li key={pid}>{p?.name || 'Unknown'} {i === 0 && <span style={{ opacity: .6 }}>(next)</span>}</li>;
              })}
            </ol>
          )}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Tables</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {g.tables.map((tb, idx) => {
              const a = g.players.find(p => p.id === tb.a);
              const b = g.players.find(p => p.id === tb.b);
              const iAmA = me && tb.a === me.id;
              const iAmB = me && tb.b === me.id;
              return (
                <div key={idx} style={{ background: '#111', borderRadius: 12, padding: 12 }}>
                  <div style={{ opacity: .8, marginBottom: 8 }}>Table {idx + 1}</div>
                  <div>{a?.name || '—'} vs {b?.name || '—'}</div>
                  {(iAmA || iAmB) && (
                    <div style={{ marginTop: 8 }}>
                      <button style={btnMini} onClick={() => iLost(idx)}>I lost</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {me && !g.queue.includes(me.id) && !g.tables.some(t => t.a === me.id || t.b === me.id) && (
            <div style={{ marginTop: 10 }}>
              <button style={btnPrimary} onClick={() => join()}>Join Queue</button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', fontFamily:'system-ui', padding:24 };
const container: React.CSSProperties = { width:'100%', maxWidth:1100, margin:'0 auto', display:'grid', gap:18 };
const header: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' };
const h1: React.CSSProperties = { margin:'8px 0 4px', fontSize:24 };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:14, padding:14 };
const btnPrimary: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
