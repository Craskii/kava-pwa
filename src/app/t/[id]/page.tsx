// src/app/t/[id]/page.tsx
"use client";
export const runtime = "edge";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import BackButton from "../../../components/BackButton";
import {
  getTournamentRemote,
  saveTournamentRemote,
  deleteTournamentRemote,
  seedInitialRoundsLocal,
  submitReportLocal,
  insertLatePlayerLocal,
  subscribeTournament,
  Tournament,
  Match,
  uid,
} from "../../../lib/storage";

export default function Lobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();

  const [t, setT] = useState<Tournament | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const retryingRef = useRef(false);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  // initial load + SSE subscription (no polling)
  useEffect(() => {
    if (!id) return;
    let unsub: (() => void) | null = null;
    (async () => {
      const first = await getTournamentRemote(id);
      if (first) setT(first);
      unsub = subscribeTournament(id, (evt) => {
        if (evt.type === "snapshot") setT(evt.tournament);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [id]);

  if (!t) return <main style={wrap}><BackButton /><p>Loading…</p></main>;

  const isHost = !!me && me.id === t.hostId;

  // ---------- conflict-safe saver (optimistic + single retry on 409) ----------
  async function commit(mutator: (draft: Tournament) => void) {
    if (!t) return;
    setErr(null);
    setSaving(true);
    try {
      const draft: Tournament = JSON.parse(JSON.stringify(t));
      mutator(draft);
      const saved = await saveTournamentRemote(draft, t.version);
      setT(saved); // in case stream lags slightly
    } catch (e: any) {
      if (e?.message === "Version conflict" && e?.latest && !retryingRef.current) {
        // Rebase to latest and retry once
        retryingRef.current = true;
        const latest = e.latest as Tournament;
        setT(latest);
        try {
          const rebased = JSON.parse(JSON.stringify(latest));
          mutator(rebased);
          const saved2 = await saveTournamentRemote(rebased, latest.version);
          setT(saved2);
        } catch {
          setErr("Could not save (conflict). Try again.");
        } finally {
          retryingRef.current = false;
        }
      } else {
        setErr("Could not save changes.");
      }
    } finally {
      setSaving(false);
    }
  }

  // ---------- queue helpers ----------
  function joinQueue() {
    if (!me) return;
    commit(d => { if (!d.queue.includes(me.id)) d.queue.push(me.id); });
  }
  function leaveQueue() {
    if (!me) return;
    commit(d => { d.queue = d.queue.filter(pid => pid !== me.id); });
  }

  // ---------- leave ----------
  async function leaveTournament() {
    if (!me || !t) return;

    if (me.id === t.hostId) {
      if (confirm("You're the host. Leave & delete this tournament?")) {
        await deleteTournamentRemote(t.id);
        r.push("/me");
      }
      return;
    }

    await commit(d => {
      const id = me.id;
      d.players = d.players.filter(p => p.id !== id);
      d.pending = (d.pending || []).filter(p => p.id !== id);
      d.queue   = d.queue.filter(pid => pid !== id);
      d.rounds = d.rounds.map(round =>
        round.map(m => ({
          ...m,
          a: m.a === id ? undefined : m.a,
          b: m.b === id ? undefined : m.b,
          winner: m.winner === id ? undefined : m.winner,
          reports: Object.fromEntries(Object.entries(m.reports || {}).filter(([k]) => k !== id)),
        }))
      );
    });
    r.push("/me");
  }

  // ---------- start / approvals / test add ----------
  function startTournament() { commit(d => { seedInitialRoundsLocal(d); }); }
  function approve(pId: string) {
    commit(d => {
      const idx = d.pending.findIndex(p => p.id === pId);
      if (idx < 0) return;
      const p = d.pending[idx];
      d.pending.splice(idx, 1);
      if (d.status === "active") insertLatePlayerLocal(d, p);
      else d.players.push(p);
    });
  }
  function decline(pId: string) { commit(d => { d.pending = d.pending.filter(p => p.id !== pId); }); }
  function addTestPlayer() {
    const pid = uid();
    const p = { id: pid, name: `Guest ${t.players.length + (t.pending?.length || 0) + 1}` };
    commit(d => {
      if (d.status === "active") insertLatePlayerLocal(d, p);
      else d.players.push(p);
    });
  }

  // ---------- host override ----------
  function hostSetWinner(roundIdx: number, matchIdx: number, winnerId?: string) {
    commit(d => {
      const m = d.rounds?.[roundIdx]?.[matchIdx];
      if (!m) return;
      m.winner = winnerId;

      // If the whole round is decided, prepare next
      const winners = d.rounds[roundIdx].map(mm => mm.winner);
      if (winners.length > 0 && winners.every(Boolean)) {
        if (winners.length === 1) {
          d.status = "completed";
        } else {
          const next: Match[] = [];
          for (let i = 0; i < winners.length; i += 2) {
            next.push({ a: winners[i], b: winners[i + 1], reports: {} });
          }
          if (d.rounds[roundIdx + 1]) d.rounds[roundIdx + 1] = next;
          else d.rounds.push(next);
        }
      }
    });
  }

  // ---------- self-report ----------
  function report(roundIdx: number, matchIdx: number, result: "win" | "loss") {
    if (!me) return;
    commit(d => { submitReportLocal(d, roundIdx, matchIdx, me.id, result); });
  }

  const lastRound = t.rounds.at(-1);
  const finalWinnerId = lastRound?.[0]?.winner;
  const iAmChampion = t.status === "completed" && finalWinnerId === me?.id;

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width:"100%", maxWidth:1100, display:"grid", gap:18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center" }}>
          <div>
            <h1 style={{ margin:"8px 0 4px" }}>{t.name}</h1>
            <div style={{ opacity:.75, fontSize:14 }}>
              {t.code ? <>Private code: <b>{t.code}</b></> : "Public tournament"} • {t.players.length} players
            </div>
            {err && (
              <div style={{ marginTop:8, padding:"8px 10px", borderRadius:8, background:"#7f1d1d", border:"1px solid #b91c1c", fontSize:13 }}>
                {err}
              </div>
            )}
            {iAmChampion && (
              <div style={{ marginTop:8, padding:"10px 12px", borderRadius:10, background:"#14532d", border:"1px solid #166534" }}>
                🎉 <b>Congratulations!</b> You won the tournament!
              </div>
            )}
          </div>

          <div style={{ textAlign:"right" }}>
            <div style={{ display:"flex", gap:8, marginTop:8, justifyContent:"flex-end" }}>
              {!t.queue.includes(me?.id || "") && (
                <button style={btn} disabled={saving} onClick={joinQueue}>Join Queue</button>
              )}
              {t.queue.includes(me?.id || "") && (
                <button style={btnGhost} disabled={saving} onClick={leaveQueue}>Leave Queue</button>
              )}
              <button style={btnGhost} disabled={saving} onClick={leaveTournament}>Leave Tournament</button>
            </div>
          </div>
        </div>

        {isHost && (
          <div style={card}>
            <h3 style={{ marginTop:0 }}>Host Controls</h3>

            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
              <input
                defaultValue={t.name}
                onBlur={(e)=>commit(d => { const v = e.target.value.trim(); if (v) d.name = v; })}
                placeholder="Rename tournament"
                style={input}
                disabled={saving}
              />
              {t.status === "setup" && (
                <button style={btn} disabled={saving} onClick={startTournament}>Start (randomize bracket)</button>
              )}
              {t.status !== "completed" && (
                <button
                  style={btnGhost}
                  disabled={saving}
                  onClick={async ()=>{
                    if (confirm("Delete tournament? This cannot be undone.")) {
                      await deleteTournamentRemote(t.id);
                      r.push("/me");
                    }
                  }}
                >Delete</button>
              )}
              <button style={btnGhost} disabled={saving} onClick={addTestPlayer}>+ Add test player</button>
            </div>

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
                        <button style={btn} disabled={saving} onClick={()=>approve(p.id)}>Approve</button>
                        <button style={btnDanger} disabled={saving} onClick={()=>decline(p.id)}>Decline</button>
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

        {t.rounds.length > 0 && (
          <div style={card}>
            <h3 style={{ marginTop:0 }}>Bracket</h3>
            <div style={{ display:"grid", gridTemplateColumns: `repeat(${t.rounds.length}, minmax(220px, 1fr))`, gap:12, overflowX:"auto" }}>
              {t.rounds.map((round, rIdx) => (
                <div key={rIdx} style={{ display:"grid", gap:8 }}>
                  <div style={{ opacity:.8, fontSize:13 }}>Round {rIdx + 1}</div>
                  {round.map((m, i) => {
                    const aName = t.players.find(p=>p.id===m.a)?.name || (m.a ? "??" : "BYE");
                    const bName = t.players.find(p=>p.id===m.b)?.name || (m.b ? "??" : "BYE");
                    const w = m.winner;

                    const iPlay = me && (m.a === me.id || m.b === me.id);
                    const canReport = iPlay && !w && t.status === "active";

                    return (
                      <div key={i} style={{ background:"#111", borderRadius:10, padding:"10px 12px", display:"grid", gap:8 }}>
                        <div>{aName} vs {bName}</div>

                        {isHost && t.status !== "completed" && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            <button style={w===m.a?btnActive:btnMini} disabled={saving} onClick={()=>hostSetWinner(rIdx, i, m.a)}>A wins</button>
                            <button style={w===m.b?btnActive:btnMini} disabled={saving} onClick={()=>hostSetWinner(rIdx, i, m.b)}>B wins</button>
                            <button style={btnMini} disabled={saving} onClick={()=>hostSetWinner(rIdx, i, undefined)}>Clear</button>
                            {w && <span style={{ fontSize:12, opacity:.8 }}>Winner: {t.players.find(p=>p.id===w)?.name}</span>}
                          </div>
                        )}

                        {!isHost && canReport && (
                          <div style={{ display:"flex", gap:6 }}>
                            <button style={btnMini} disabled={saving} onClick={()=>report(rIdx, i, "win")}>I won</button>
                            <button style={btnMini} disabled={saving} onClick={()=>report(rIdx, i, "loss")}>I lost</button>
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

/* --------- styles --------- */
const wrap: React.CSSProperties = { minHeight:"100vh", background:"#0b0b0b", color:"#fff", fontFamily:"system-ui", padding:24, position:"relative" };
const card: React.CSSProperties = { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:14 };
const btn: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const btnDanger: React.CSSProperties = { ...btnGhost, borderColor:"#ff6b6b", color:"#ff6b6b" };
const btnMini: React.CSSProperties = { padding:"6px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12 };
const btnActive: React.CSSProperties = { ...btnMini, background:"#0ea5e9", border:"none" };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
