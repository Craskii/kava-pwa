'use client';
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BackButton from "../../../components/BackButton";
import {
  getTournament, saveTournament, seedBracket, Tournament
} from "../../../lib/storage";

export default function Lobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [t, setT] = useState<Tournament | null>(null);

  const me = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  useEffect(() => { setT(getTournament(id)); }, [id]);

  if (!t) return <main style={wrap}><BackButton /><p>Loading…</p></main>;

  const isHost = me?.id === t.hostId;
  const myPos = me ? t.queue.findIndex(p => p === me.id) + 1 : -1;

  // safe updater
  function update(mut: (x: Tournament) => void) {
    setT(prev => {
      if (!prev) return prev;
      const copy: Tournament = {
        ...prev,
        players: [...prev.players],
        queue: [...prev.queue],
        matches: [...(prev.matches || [])],
      };
      mut(copy);
      saveTournament(copy);
      return copy;
    });
  }

  function joinQueue() {
    if (!me) return;
    update(x => { if (!x.queue.includes(me.id)) x.queue.push(me.id); });
  }
  function leaveQueue() {
    if (!me) return;
    update(x => { x.queue = x.queue.filter(id => id !== me.id); });
  }
  function leaveTournament() {
    if (!me) return;
    update(x => {
      x.players = x.players.filter(p => p.id !== me.id);
      x.queue = x.queue.filter(id => id !== me.id);
      x.matches = (x.matches || []).map(m => ({
        ...m,
        a: m.a === me.id ? undefined : m.a,
        b: m.b === me.id ? undefined : m.b,
        winner: m.winner === me.id ? undefined : m.winner,
      }));
    });
    r.push("/");
  }
  function kick(pId: string) {
    update(x => {
      x.players = x.players.filter(p => p.id !== pId);
      x.queue = x.queue.filter(id => id !== pId);
      x.matches = (x.matches || []).map(m => ({
        ...m,
        a: m.a === pId ? undefined : m.a,
        b: m.b === pId ? undefined : m.b,
        winner: m.winner === pId ? undefined : m.winner,
      }));
    });
  }
  function startBracket() { update(seedBracket); }
  function setWinner(i: number, id?: string) { update(x => { x.matches[i].winner = id; }); }
  function editName(newName: string) { update(x => { if (newName.trim()) x.name = newName.trim(); }); }

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width:"100%", maxWidth:900, display:"grid", gap:18 }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center" }}>
          <div>
            <h1 style={{ margin:"8px 0 4px" }}>{t.name}</h1>
            <div style={{ opacity:.75, fontSize:14 }}>
              {t.code ? <>Private code: <b>{t.code}</b></> : "Public tournament"}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            {me && myPos>0 && <div style={{ fontSize:14, opacity:.8 }}>Your queue position: <b>#{myPos}</b></div>}
            <div style={{ display:"flex", gap:8, marginTop:8, justifyContent:"flex-end" }}>
              {!t.queue.includes(me?.id || "") && <button style={btn} onClick={joinQueue}>Join Queue</button>}
              {t.queue.includes(me?.id || "") && <button style={btnGhost} onClick={leaveQueue}>Leave Queue</button>}
              <button style={btnGhost} onClick={leaveTournament}>Leave Tournament</button>
            </div>
          </div>
        </div>

        {/* Host controls */}
        {isHost && (
          <div style={card}>
            <h3 style={{ marginTop:0 }}>Host Controls</h3>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <input
                defaultValue={t.name}
                onBlur={(e)=>editName(e.target.value)}
                placeholder="Rename tournament"
                style={input}
              />
              <button style={btn} onClick={startBracket}>Generate Bracket</button>
            </div>
            <p style={{ opacity:.75, fontSize:12, marginTop:8 }}>
              Tip: remove no-shows from participants — their opponent advances.
            </p>
          </div>
        )}

        {/* Participants */}
        <div style={card}>
          <h3 style={{ marginTop:0 }}>Participants ({t.players.length})</h3>
          <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gap:8 }}>
            {t.players.map(p => (
              <li key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#111", padding:"10px 12px", borderRadius:10 }}>
                <span>{p.name}{p.id===t.hostId && " (Host)"}{p.id===me?.id && " — You"}</span>
                <span style={{ fontSize:12, opacity:.75 }}>
                  {t.queue.includes(p.id) ? `#${t.queue.findIndex(x=>x===p.id)+1}` : '—'}
                </span>
                {isHost && p.id!==t.hostId && (
                  <button style={btnDanger} onClick={()=>kick(p.id)}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Bracket */}
        {t.matches?.length>0 && (
          <div style={card}>
            <h3 style={{ marginTop:0 }}>Bracket</h3>
            <div style={{ display:"grid", gap:8 }}>
              {t.matches.map((m, i) => {
                const a = t.players.find(p=>p.id===m.a)?.name || (m.a ? "??" : "BYE");
                const b = t.players.find(p=>p.id===m.b)?.name || (m.b ? "??" : "BYE");
                const w = m.winner;
                return (
                  <div key={i} style={{ background:"#111", borderRadius:10, padding:"10px 12px", display:"flex", gap:8, alignItems:"center", justifyContent:"space-between" }}>
                    <div>{a} vs {b}</div>
                    {isHost && (
                      <div style={{ display:"flex", gap:6 }}>
                        <button style={w===m.a?btnActive:btnMini} onClick={()=>setWinner(i, m.a)}>A wins</button>
                        <button style={w===m.b?btnActive:btnMini} onClick={()=>setWinner(i, m.b)}>B wins</button>
                        <button style={btnMini} onClick={()=>setWinner(i, undefined)}>Clear</button>
                      </div>
                    )}
                    {!isHost && w && <div style={{ fontSize:12, opacity:.8 }}>Winner: {t.players.find(p=>p.id===w)?.name}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:"100vh", background:"#0b0b0b", color:"#fff", fontFamily:"system-ui", padding:24, position:"relative" };
const card: React.CSSProperties = { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:14 };
const btn: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const btnDanger: React.CSSProperties = { ...btnGhost, borderColor:"#ff6b6b", color:"#ff6b6b" };
const btnMini: React.CSSProperties = { padding:"6px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12 };
const btnActive: React.CSSProperties = { ...btnMini, background:"#0ea5e9", border:"none" };

// ✅ missing style that caused the error
const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#111",
  color: "#fff",
};
