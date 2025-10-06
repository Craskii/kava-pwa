// src/app/t/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BackButton from "../../../components/BackButton";
import {
  // types
  type Tournament,
  type Match,
  // bracket & helpers (mutate object; we persist remotely)
  seedInitialRounds as seedInitial,
  submitReport,
  approvePending,
  declinePending,
  insertLatePlayer,
  uid,
  // remote I/O
  getTournamentRemote,
  saveTournamentRemote,
  deleteTournamentRemote,
} from "../../../lib/storage";

/* ---------- tiny local helpers (no imports needed) ---------- */
function readLocal(id: string): Tournament | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("tournaments");
    if (!raw) return null;
    const arr = JSON.parse(raw) as Tournament[];
    return arr.find(t => t.id === id) || null;
  } catch { return null; }
}
function writeLocal(t: Tournament) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("tournaments");
    const arr = raw ? (JSON.parse(raw) as Tournament[]) : [];
    const next = [t, ...arr.filter(x => x.id !== t.id)];
    localStorage.setItem("tournaments", JSON.stringify(next));
  } catch {}
}

export default function Lobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();

  const [t, setT] = useState<Tournament | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const me = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  /* ---------- 1) hydrate from local first (fast) ---------- */
  useEffect(() => {
    setLoading(true);
    setNotFound(false);

    const local = readLocal(id);
    if (local) setT(sanitizeTournament(local));

    /* ---------- 2) then fetch remote and replace if found ---------- */
    (async () => {
      try {
        const remote = await getTournamentRemote(id);
        if (remote) {
          const clean = sanitizeTournament(remote);
          setT(clean);
          writeLocal(clean);              // keep offline mirror fresh
          setNotFound(false);
        } else if (!local) {
          // neither remote nor local — show not found
          setT(null);
          setNotFound(true);
        }
      } catch {
        // network error: keep whatever we had locally, but stop the spinner
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <main style={wrap}>
        <BackButton />
        <p>Loading…</p>
      </main>
    );
  }

  if (notFound || !t) {
    return (
      <main style={wrap}>
        <BackButton />
        <div style={{maxWidth:700}}>
          <h2 style={{marginTop:12}}>Tournament not found</h2>
          <p style={{opacity:.8}}>
            We couldn’t find a tournament with this link. Ask the host for the 4-digit code
            and try joining again from the <b>Join with Code</b> screen.
          </p>
        </div>
      </main>
    );
  }

  const isHost = me?.id === t.hostId;

  /** Safe updater: copy -> mutate -> persist (remote) -> set + mirror local */
  function update(mut: (x: Tournament) => void) {
    setT(prev => {
      if (!prev) return prev;
      const copy: Tournament = deepCloneTournament(prev);
      mut(copy);
      // save remotely and mirror locally
      void saveTournamentRemote(copy);
      writeLocal(copy);
      return copy;
    });
  }

  // ---------- queue helpers ----------
  function joinQueue() {
    if (!me) return;
    update(x => { if (!x.queue.includes(me.id)) x.queue.push(me.id); });
  }
  function leaveQueue() {
    if (!me) return;
    update(x => { x.queue = x.queue.filter(pid => pid !== me.id); });
  }

  // ---------- leave / delete ----------
  async function leaveTournament() {
    if (!me) return;

    if (me.id === t.hostId) {
      if (confirm("You're the host. Leave & delete this tournament?")) {
        await deleteTournamentRemote(t.id);
        r.push("/");
      }
      return;
    }

    update(x => {
      x.players = x.players.filter(p => p.id !== me.id);
      x.queue = x.queue.filter(pid => pid !== me.id);
      x.rounds = (x.rounds || []).map(round =>
        (round || []).map(m => ({
          ...m,
          a: m.a === me.id ? undefined : m.a,
          b: m.b === me.id ? undefined : m.b,
          winner: m.winner === me.id ? undefined : m.winner,
          reports: Object.fromEntries(
            Object.entries(m.reports || {}).filter(([pid]) => pid !== me.id)
          ),
        }))
      );
    });
    r.push("/");
  }

  // ---------- advance rounds when a round completes ----------
  function advanceFromRound(roundIdx: number) {
    update(x => {
      const cur = x.rounds[roundIdx] || [];
      const winners = cur.map(m => m.winner);
      if (winners.some(w => !w)) return;

      // final
      if (winners.length === 1 && winners[0]) {
        x.status = "completed";
        return;
      }

      const next: Match[] = [];
      for (let i = 0; i < winners.length; i += 2) {
        next.push({ a: winners[i], b: winners[i + 1], reports: {} });
      }

      if (x.rounds[roundIdx + 1]) x.rounds[roundIdx + 1] = next;
      else x.rounds.push(next);
    });
  }

  // Host override winner
  function hostSetWinner(roundIdx: number, matchIdx: number, winnerId?: string) {
    update(x => {
      const m = x.rounds?.[roundIdx]?.[matchIdx];
      if (!m) return;
      m.winner = winnerId;
      if (winnerId) advanceFromRound(roundIdx);
    });
  }

  // Start / approvals / test-add
  function startTournament() { update(seedInitial); }
  function approve(pId: string) { update(x => approvePending(x, pId)); }
  function decline(pId: string) { update(x => declinePending(x, pId)); }

  function addTestPlayer() {
    const count = (t?.players?.length ?? 0) + (t?.pending?.length ?? 0) + 1;
    const pid = uid();
    const p = { id: pid, name: `Guest ${count}` };

    update(x => {
      if (x.status === "active") insertLatePlayer(x, p);
      else x.players.push(p);
    });
  }

  // Self-report (player)
  function report(roundIdx: number, matchIdx: number, result: "win" | "loss") {
    if (!me) return;
    update(x => {
      submitReport(x, roundIdx, matchIdx, me.id, result);
    });
  }

  // Header info
  const rounds = t.rounds || [];
  const lastRound = rounds.at(-1);
  const finalWinnerId = lastRound?.[0]?.winner;
  const iAmChampion = t.status === "completed" && finalWinnerId === me?.id;

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width:"100%", maxWidth:1100, display:"grid", gap:18 }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center" }}>
          <div>
            <h1 style={{ margin:"8px 0 4px" }}>{t.name}</h1>
            <div style={{ opacity:.75, fontSize:14 }}>
              {t.code ? <>Private code: <b>{t.code}</b></> : "Public tournament"} • {t.players.length} players
            </div>
            {iAmChampion && (
              <div style={{ marginTop:8, padding:"10px 12px", borderRadius:10, background:"#14532d", border:"1px solid #166534" }}>
                🎉 <b>Congratulations!</b> You won the tournament!
              </div>
            )}
          </div>

          <div style={{ textAlign:"right" }}>
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

            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
              <input
                defaultValue={t.name}
                onBlur={(e)=>update(x => { const v = e.target.value.trim(); if (v) x.name = v; })}
                placeholder="Rename tournament"
                style={input}
              />
              {t.status === "setup" && (
                <button style={btn} onClick={startTournament}>Start (randomize bracket)</button>
              )}
              {t.status !== "completed" && (
                <button
                  style={btnGhost}
                  onClick={async ()=>{
                    if (confirm("Delete tournament? This cannot be undone.")) {
                      await deleteTournamentRemote(t.id);
                      r.push("/");
                    }
                  }}
                >Delete</button>
              )}
              <button style={btnGhost} onClick={addTestPlayer}>+ Add test player</button>
            </div>

            {/* Pending approvals */}
            <div style={{ marginTop:8 }}>
              <h4 style={{ margin:"6px 0" }}>Pending approvals ({t.pending?.length || 0})</h4>
              {(t.pending?.length || 0) === 0 ? (
                <div style={{ opacity:.7, fontSize:13 }}>No pending players.</div>
              ) : (
                <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gap:8 }}>
                  {t.pending!.map(p => (
                    <li key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#111", padding:"10px 12px", borderRadius:10 }}>
                      <span>{p.name}</span>
                      <div style={{ display:"flex", gap:8 }}>
                        <button style={btn} onClick={()=>approve(p.id)}>Approve</button>
                        <button style={btnDanger} onClick={()=>decline(p.id)}>Decline</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p style={{ opacity:.75, fontSize:12, marginTop:8 }}>
              Start randomizes the bracket and handles BYEs automatically.
              Late approvals fill BYEs; if none, a play-in is added at the bottom.
            </p>
          </div>
        )}

        {/* Bracket */}
        {(rounds.length > 0) && (
          <div style={card}>
            <h3 style={{ marginTop:0 }}>Bracket</h3>
            <div style={{ display:"grid", gridTemplateColumns: `repeat(${rounds.length}, minmax(220px, 1fr))`, gap:12, overflowX:"auto" }}>
              {rounds.map((round, rIdx) => (
                <div key={rIdx} style={{ display:"grid", gap:8 }}>
                  <div style={{ opacity:.8, fontSize:13 }}>Round {rIdx + 1}</div>
                  {(round || []).map((m, i) => {
                    const aName = t.players.find(p=>p.id===m.a)?.name || (m.a ? "??" : "BYE");
                    const bName = t.players.find(p=>p.id===m.b)?.name || (m.b ? "??" : "BYE");
                    const w = m.winner;

                    const iPlay = me && (m.a === me.id || m.b === me.id);
                    const canReport = iPlay && !w && t.status === "active";

                    return (
                      <div key={i} style={{ background:"#111", borderRadius:10, padding:"10px 12px", display:"grid", gap:8 }}>
                        <div>{aName} vs {bName}</div>

                        {/* Host override */}
                        {isHost && t.status !== "completed" && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            <button style={w===m.a?btnActive:btnMini} onClick={()=>hostSetWinner(rIdx, i, m.a)}>A wins</button>
                            <button style={w===m.b?btnActive:btnMini} onClick={()=>hostSetWinner(rIdx, i, m.b)}>B wins</button>
                            <button style={btnMini} onClick={()=>hostSetWinner(rIdx, i, undefined)}>Clear</button>
                            {w && <span style={{ fontSize:12, opacity:.8 }}>Winner: {t.players.find(p=>p.id===w)?.name}</span>}
                          </div>
                        )}

                        {/* Player self-report */}
                        {!isHost && canReport && (
                          <div style={{ display:"flex", gap:6 }}>
                            <button style={btnMini} onClick={()=>report(rIdx, i, "win")}>I won</button>
                            <button style={btnMini} onClick={()=>report(rIdx, i, "loss")}>I lost</button>
                          </div>
                        )}
                        {!isHost && w && (
                          <div style={{ fontSize:12, opacity:.8 }}>
                            Winner: {t.players.find(p=>p.id===w)?.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* --------- utilities --------- */
function sanitizeTournament(t: Tournament): Tournament {
  return {
    ...t,
    players: t.players || [],
    pending: t.pending || [],
    queue: t.queue || [],
    rounds: (t.rounds || []).map(r => (r || []).map(m => ({ ...m, reports: m.reports || {} }))),
  };
}
function deepCloneTournament(prev: Tournament): Tournament {
  return {
    ...prev,
    players: [...(prev.players || [])],
    pending: [...(prev.pending || [])],
    queue: [...(prev.queue || [])],
    rounds: (prev.rounds || []).map((round): Match[] =>
      (round || []).map((m): Match => ({ ...m, reports: { ...(m.reports || {}) } }))
    ),
  };
}

/* --------- styles --------- */
const wrap: React.CSSProperties = { minHeight:"100vh", background:"#0b0b0b", color:"#fff", fontFamily:"system-ui", padding:24, position:"relative" };
const card: React.CSSProperties = { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:14 };
const btn: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const btnDanger: React.CSSProperties = { ...btnGhost, borderColor:"#ff6b6b", color:"#ff6b6b" };
const btnMini: React.CSSProperties = { padding:"6px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12 };
const btnActive: React.CSSProperties = { ...btnMini, background:"#0ea5e9", border:"none" };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
