// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import { ListGame, Player, saveListRemote, getListRemote, deleteListRemote, uid } from '../../../lib/storage';
import { startSmartPoll } from '../../../lib/poll';

export default function ListLobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [g, setG] = useState<ListGame | null>(null);
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch { return null; }
  }, []);

  useEffect(() => {
    if (!id) return;
    pollRef.current?.stop();
    const poll = startSmartPoll(async () => {
      const res = await fetch(`/api/list/${id}`, { cache: 'no-store' });
      if (res.status === 404) {
        r.push('/');
        r.refresh();
        return null;
      }
      if (res.ok) {
        const v = res.headers.get('x-t-version') || '';
        const next = await res.json();
        setG(next);
        return v;
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
    await saveListRemote(copy);
    setG(copy);
    pollRef.current?.bump?.();
  }

  // host: set table count 1 or 2
  function setTables(n: 1 | 2) {
    update(x => {
      if (n === 1) x.tables = [x.tables[0] || {}];
      else x.tables = [x.tables[0] || {}, x.tables[1] || {}];
    });
  }

  // player join from /me (or here)
  function join(name?: string) {
    const nm = (name || me?.name || 'Player').trim();
    const pid = me?.id || uid();
    update(x => {
      if (!x.players.find(p => p.id === pid)) x.players.push({ id: pid, name: nm });
      if (!x.queue.includes(pid) && !x.tables.some(t => t.a === pid || t.b === pid)) {
        x.queue.push(pid);
      }
      fillTables(x);
    });
  }

  // main engine: fill any empty seat with next in queue
  function fillTables(x: ListGame) {
    for (const t of x.tables) {
      const seats = [t.a, t.b];
      for (let si = 0; si < 2; si++) {
        if (!seats[si]) {
          const next = x.queue.shift();
          if (next) {
            if (si === 0) t.a = next; else t.b = next;
          }
        }
      }
    }
  }

  // “I lost”: remove loser, winner stays, fill seat from queue
  function iLost(tableIndex: number, loserId: string) {
    update(x => {
      const tb = x.tables[tableIndex];
      if (!tb) return;
      if (tb.a === loserId) tb.a = undefined;
      if (tb.b === loserId) tb.b = undefined;
      // winner remains, now refill the open seat from queue
      fillTables(x);
    });
  }

  async function leaveOrDelete() {
    if (isHost) {
      if (confirm('Delete this list room?')) {
        await deleteListRemote(g.id);
        r.push('/');
        r.refresh();
      }
    } else if (me) {
      update(x => {
        x.queue = x.queue.filter(id => id !== me.id);
        x.tables.forEach(tb => {
          if (tb.a === me.id) tb.a = undefined;
          if (tb.b === me.id) tb.b = undefined;
        });
        x.players = x.players.filter(p => p.id !== me.id);
        fillTables(x);
      });
      r.push('/me');
      r.refresh();
    }
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
          <div>
            <button style={btnGhost} onClick={leaveOrDelete}>{isHost ? 'Delete' : 'Leave'}</button>
          </div>
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

        {/* Queue */}
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

        {/* Tables */}
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
                      <button style={btnMini} onClick={() => iLost(idx, me!.id)}>I lost</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Allow self-join if not already in tables/queue */}
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

const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', fontFamily:'system-ui', padding:24 };
const container: React.CSSProperties = { width:'100%', maxWidth:1100, margin:'0 auto', display:'grid', gap:18 };
const header: React.CSSProperties = { display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' };
const h1: React.CSSProperties = { margin:'8px 0 4px', fontSize:24 };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:14, padding:14 };
const btnPrimary: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer' };
const btnMini: React.CSSProperties = { padding:'6px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', fontSize:12 };
