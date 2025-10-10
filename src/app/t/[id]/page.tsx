// src/app/t/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import {
  saveTournamentRemote,
  deleteTournamentRemote,
  seedInitialRounds as seedInitial,
  submitReport,
  approvePending,
  declinePending,
  insertLatePlayer,
  Tournament,
  uid,
  Match,
} from '../../../lib/storage';
import { startSmartPoll } from '../../../lib/poll';

export default function Lobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [t, setT] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false); // global small lock to avoid double taps
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); }
    catch { return null; }
  }, []);
  useEffect(() => {
    // bootstrap identity if missing
    if (!me) {
      const m = { id: uid(), name: 'Player' };
      localStorage.setItem('kava_me', JSON.stringify(m));
    }
  }, [me]);

  // initial load + smart poll
  useEffect(() => {
    if (!id) return;
    pollRef.current?.stop();
    const poll = startSmartPoll(async () => {
      const res = await fetch(`/api/tournament/${id}`, { cache: "no-store" });
      if (res.ok) {
        const v = res.headers.get("x-t-version") || "";
        const next = await res.json();
        setT(next);
        return v;
      }
      return null;
    });
    pollRef.current = poll;
    return () => poll.stop();
  }, [id]);

  // If my name in the tournament diverges from local “me”, fix it once
  useEffect(() => {
    if (!t || !me) return;
    const idx = t.players.findIndex(p => p.id === me.id);
    if (idx >= 0 && t.players[idx].name !== me.name && !busy) {
      (async () => {
        setBusy(true);
        try {
          const copy: Tournament = {
            ...t,
            players: t.players.map(p => p.id === me.id ? { ...p, name: me.name } : p),
            rounds: t.rounds.map(r => r.map(m => ({ ...m, reports: { ...(m.reports || {}) } }))),
            pending: [...t.pending],
          };
          const saved = await saveTournamentRemote(copy);
          setT(saved);
          pollRef.current?.bump();
        } catch (e) { console.error(e); }
        finally { setBusy(false); }
      })();
    }
  }, [t, me, busy]);

  if (!t) {
    return (
      <main style={wrap}>
        <div style={container}>
          <BackButton href="/" />
          <p>Loading…</p>
        </div>
      </main>
    );
  }

  const isHost = me?.id === t.hostId;

  // ---------- safe updater that writes remote ----------
  async function update(mut: (x: Tournament) => void) {
    if (busy) return;
    setBusy(true);
    const copy: Tournament = {
      ...t,
      players: [...t.players],
      pending: [...(t.pending || [])],
      rounds: t.rounds.map((rr): Match[] =>
        rr.map((m): Match => ({ ...m, reports: { ...(m.reports || {}) } }))
      ),
    };
    mut(copy);
    try {
      const saved = await saveTournamentRemote(copy);
      setT(saved);
      pollRef.current?.bump();
    } catch (e) {
      console.error(e);
      alert('Could not save changes.');
    } finally {
      setBusy(false);
    }
  }

  // ---------- leave ----------
  async function leaveTournament() {
    if (!me || busy) return;
    if (me.id === t.hostId) {
      if (!confirm("You're the host. Leave & delete this tournament?")) return;
      setBusy(true);
      try {
        await deleteTournamentRemote(t.id);
        r.push('/');
        r.refresh();
      } finally { setBusy(false); }
      return;
    }
    await update(x => {
      x.players = x.players.filter(p => p.id !== me.id);
      x.pending = (x.pending || []).filter(p => p.id !== me.id);
      x.rounds = x.rounds.map(round =>
        round.map(m => ({
          ...m,
          a: m.a === me.id ? undefined : m.a,
          b: m.b === me.id ? undefined : m.b,
          winner: m.winner === me.id ? undefined : m.winner,
          reports: Object.fromEntries(
            Object.entries(m.reports || {}).filter(([k]) => k !== me.id)
          ),
        }))
      );
    });
    r.push('/');
    r.refresh();
  }

  // ---------- advance helpers ----------
  function hostSetWinner(roundIdx: number, matchIdx: number, winnerId?: string) {
    update((x) => {
      const m = x.rounds?.[roundIdx]?.[matchIdx];
      if (!m) return;
      m.winner = winnerId;
      if (winnerId) {
        const winners = x.rounds[roundIdx].map((mm) => mm.winner);
        if (winners.every(Boolean)) {
          const last = x.rounds.length - 1 === roundIdx;
          if (last) {
            const winnersArr = x.rounds[roundIdx].map((mm) => mm.winner);
            if (winnersArr.length === 1) x.status = 'completed';
            else {
              const next: Match[] = [];
              for (let i = 0; i < winnersArr.length; i += 2) {
                next.push({ a: winnersArr[i], b: winnersArr[i + 1], reports: {} });
              }
              x.rounds.push(next);
            }
          }
        }
      }
    });
  }

  // ---------- start / approvals / test add ----------
  function startTournament() { update(seedInitial); }
  function approve(pId: string) { update((x) => approvePending(x, pId)); }
  function decline(pId: string) { update((x) => declinePending(x, pId)); }
  function addTestPlayer() {
    const pid = uid();
    const p = { id: pid, name: `Guest ${t.players.length + (t.pending?.length || 0) + 1}` };
    update((x) => { if (x.status === 'active') insertLatePlayer(x, p); else x.players.push(p); });
  }

  // ---------- self-report ----------
  function report(roundIdx: number, matchIdx: number, result: 'win' | 'loss') {
    if (!me) return;
    update((x) => { submitReport(x, roundIdx, matchIdx, me.id, result); });
  }

  const lastRound = t.rounds.at(-1);
  const finalWinnerId = lastRound?.[0]?.winner;
  const iAmChampion = t.status === 'completed' && finalWinnerId === me?.id;

  const lock = { opacity: busy ? .6 : 1, pointerEvents: busy ? 'none' as const : 'auto' };

  return (
    <main style={wrap}>
      <div style={container}>
        <BackButton href="/" />

        <header style={header}>
          <div>
            <h1 style={h1}>{t.name}</h1>
            <div style={subhead}>
              {t.code ? <>Private code: <b>{t.code}</b></> : 'Public tournament'} • {t.players.length} {t.players.length === 1 ? 'player' : 'players'}
            </div>
            {iAmChampion && (
              <div style={champ}>
                🎉 <b>Congratulations!</b> You won the tournament!
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button style={{...btnGhost, ...lock}} onClick={leaveTournament}>Leave Tournament</button>
            </div>
          </div>
        </header>

        {isHost && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Host Controls</h3>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                defaultValue={t.name}
                onBlur={(e) => update((x) => { const v = e.target.value.trim(); if (v) x.name = v; })}
                placeholder="Rename tournament"
                style={input}
                disabled={busy}
              />
              {t.status === 'setup' && (
                <button style={{...btn, ...lock}} onClick={startTournament}>
                  Start (randomize bracket)
                </button>
              )}
              {t.status !== 'completed' && (
                <button
                  style={{...btnGhost, ...lock}}
                  onClick={async () => {
                    if (busy) return;
                    if (confirm('Delete tournament? This cannot be undone.')) {
                      setBusy(true);
                      try {
                        await deleteTournamentRemote(t.id);
                        r.push('/');
                        r.refresh();
                      } finally { setBusy(false); }
                    }
                  }}
                >
                  Delete
                </button>
              )}
              <button style={{...btnGhost, ...lock}} onClick={addTestPlayer}>+ Add test player</button>
            </div>

            <div style={{ marginTop: 8 }}>
              <h4 style={{ margin: '6px 0' }}>
                Pending approvals ({t.pending?.length || 0})
              </h4>
              {(t.pending?.length || 0) === 0 ? (
                <div style={{ opacity: 0.7, fontSize: 13 }}>No pending players.</div>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  {t.pending!.map((p) => (
                    <li
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#111',
                        padding: '10px 12px',
                        borderRadius: 10,
                      }}
                    >
                      <span>{p.name}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={{...btn, ...lock}} onClick={() => approve(p.id)}>
                          Approve
                        </button>
                        <button style={{...btnDanger, ...lock}} onClick={() => decline(p.id)}>
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p style={{ opacity: 0.75, fontSize: 12, marginTop: 8 }}>
              Start randomizes the bracket and handles BYEs automatically. Late approvals
              fill BYEs; if none, a play-in is added at the bottom.
            </p>
          </div>
        )}

        {t.rounds.length > 0 && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Bracket</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${t.rounds.length}, minmax(220px, 1fr))`,
                gap: 12,
                overflowX: 'auto',
              }}
            >
              {t.rounds.map((round, rIdx) => (
                <div key={rIdx} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ opacity: 0.8, fontSize: 13 }}>Round {rIdx + 1}</div>
                  {round.map((m, i) => {
                    const aName =
                      t.players.find((p) => p.id === m.a)?.name || (m.a ? '??' : 'BYE');
                    const bName =
                      t.players.find((p) => p.id === m.b)?.name || (m.b ? '??' : 'BYE');
                    const w = m.winner;

                    const iPlay = me && (m.a === me.id || m.b === me.id);
                    const canReport = iPlay && !w && t.status === 'active';

                    return (
                      <div
                        key={i}
                        style={{
                          background: '#111',
                          borderRadius: 10,
                          padding: '10px 12px',
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div>
                          {aName} vs {bName}
                        </div>

                        {isHost && t.status !== 'completed' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              style={w === m.a ? btnActive : btnMini}
                              onClick={() => hostSetWinner(rIdx, i, m.a)}
                              disabled={busy}
                            >
                              A wins
                            </button>
                            <button
                              style={w === m.b ? btnActive : btnMini}
                              onClick={() => hostSetWinner(rIdx, i, m.b)}
                              disabled={busy}
                            >
                              B wins
                            </button>
                            <button
                              style={btnMini}
                              onClick={() => hostSetWinner(rIdx, i, undefined)}
                              disabled={busy}
                            >
                              Clear
                            </button>
                            {w && (
                              <span style={{ fontSize: 12, opacity: 0.8 }}>
                                Winner: {t.players.find((p) => p.id === w)?.name}
                              </span>
                            )}
                          </div>
                        )}

                        {!isHost && canReport && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={btnMini} onClick={() => report(rIdx, i, 'win')} disabled={busy}>
                              I won
                            </button>
                            <button style={btnMini} onClick={() => report(rIdx, i, 'loss')} disabled={busy}>
                              I lost
                            </button>
                          </div>
                        )}
                        {!isHost && w && (
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            Winner: {t.players.find((p) => p.id === w)?.name}
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
const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  fontFamily: 'system-ui',
  padding: 24,
};

const container: React.CSSProperties = {
  width: '100%',
  maxWidth: 1100,
  margin: '0 auto',
  display: 'grid',
  gap: 18,
};

const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
};

const h1: React.CSSProperties = { margin: '8px 0 4px', fontSize: 24 };
const subhead: React.CSSProperties = { opacity: 0.75, fontSize: 14 };
const champ: React.CSSProperties = {
  marginTop: 8,
  padding: '10px 12px',
  borderRadius: 10,
  background: '#14532d',
  border: '1px solid #166534',
};

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: 14,
};
const btn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
};
const btnDanger: React.CSSProperties = { ...btnGhost, borderColor: '#ff6b6b', color: '#ff6b6b' };
const btnMini: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
};
const btnActive: React.CSSProperties = { ...btnMini, background: '#0ea5e9', border: 'none' };
const input: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#111',
  color: '#fff',
};
