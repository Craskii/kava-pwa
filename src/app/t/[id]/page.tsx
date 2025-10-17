// src/app/t/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '@/components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/lib/alerts';
import {
  saveTournamentRemote,
  deleteTournamentRemote,
  submitReport,
  approvePending,
  declinePending,
  insertLatePlayer,
  Tournament,
  uid,
  Match,
  getTournamentRemote,
} from '../../../lib/storage';
import { startSmartPoll } from '../../../lib/poll';

/* ---------- helpers ---------- */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function normalizeMatch(m: Match): Match | null {
  const a = m.a, b = m.b;
  if (!a && !b) return null;
  if (a && !b) return { ...m, winner: a, reports: m.reports ?? {} };
  if (!a && b) return { ...m, winner: b, reports: m.reports ?? {} };
  return { ...m, reports: m.reports ?? {} };
}
function seedLocal(t: Tournament): Tournament {
  const ids = shuffle(t.players.map(p => p.id));
  const first: Match[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i], b = ids[i + 1];
    const nm = normalizeMatch({ a, b, reports: {} });
    if (nm) first.push(nm);
  }
  const seeded: Tournament = { ...t, rounds: [first], status: 'active' };
  buildNextRoundFromSync(seeded, 0);
  return seeded;
}
function buildNextRoundFromSync(t: Tournament, roundIndex: number) {
  const cur = t.rounds[roundIndex] || [];
  const normalized: Match[] = [];
  for (const m of cur) {
    const nm = normalizeMatch(m);
    if (nm) normalized.push(nm);
  }
  t.rounds[roundIndex] = normalized;

  const winners = normalized.map(m => m.winner).filter(Boolean) as string[];
  if (normalized.some(m => !m.winner)) return;

  if (winners.length <= 1) {
    if (winners.length === 1) t.status = 'completed';
    return;
  }
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const a = winners[i], b = winners[i + 1];
    const nm = normalizeMatch({ a, b, reports: {} });
    if (nm) next.push(nm);
  }
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next;
  else t.rounds.push(next);

  if (next.every(m => !!m.winner)) buildNextRoundFromSync(t, roundIndex + 1);
}

export default function Lobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [t, setT] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  // players modal
  const [playersOpen, setPlayersOpen] = useState(false);

  const me = useMemo(() => { try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch { return null; } }, []);
  useEffect(() => { if (!me) localStorage.setItem('kava_me', JSON.stringify({ id: uid(), name: 'Player' })); }, [me]);

  useQueueAlerts({
    tournamentId: String(id),
    upNextMessage: (s: any) => `your up now in ${s?.bracketRoundName || 'this round'}!`,
    matchReadyMessage: (s: any) => {
      const raw = s?.tableNumber ?? s?.table?.number ?? null;
      const n = Number(raw);
      const shown = Number.isFinite(n) ? (n === 0 || n === 1 ? n + 1 : n) : null;
      return shown ? `Your in table (#${shown})` : 'Your in table';
    },
  });

  // load + smart poll
  useEffect(() => {
    if (!id) return;
    pollRef.current?.stop();
    const poll = startSmartPoll(async () => {
      const res = await fetch(`/api/tournament/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const v = res.headers.get('x-t-version') || '';
        const next = await res.json();
        setT(next);
        return v;
      }
      return null;
    });
    pollRef.current = poll;
    return () => poll.stop();
  }, [id]);

  if (!t) return (
    <main style={wrap}>
      <div style={container}>
        <BackButton href="/" />
        <p>Loading…</p>
      </div>
    </main>
  );

  const coHosts = t.coHosts ?? [];
  const iAmHost = me?.id === t.hostId;
  const iAmCoHost = !!me && coHosts.includes(me.id);
  const canHost = iAmHost || iAmCoHost;

  async function update(mut: (x: Tournament) => void) {
    if (busy) return;
    setBusy(true);
    const base: Tournament = {
      ...t,
      players: [...t.players],
      pending: [...t.pending],
      rounds: t.rounds.map(rr => rr.map(m => ({ ...m, reports: { ...(m.reports || {}) } })) ),
      coHosts: [...coHosts],
    };
    const first = structuredClone(base);
    mut(first);
    try {
      const saved = await saveTournamentRemote(first);
      setT(saved); pollRef.current?.bump(); bumpAlerts();
    } catch {
      try {
        const latest = await getTournamentRemote(t.id);
        if (!latest) throw new Error('fetch-latest-failed');
        const second: Tournament = {
          ...latest,
          players: [...latest.players],
          pending: [...latest.pending],
          rounds: latest.rounds.map(rr => rr.map(m => ({ ...m, reports: { ...(m.reports || {}) } })) ),
          coHosts: [...(latest.coHosts ?? [])],
        };
        mut(second);
        const saved = await saveTournamentRemote(second);
        setT(saved); pollRef.current?.bump(); bumpAlerts();
      } catch (e) {
        console.error(e);
        alert('Could not save changes.');
      }
    } finally { setBusy(false); }
  }

  async function leaveTournament() {
    if (!me || busy) return;
    if (me.id === t.hostId) {
      if (!confirm("You're the host. Leave & delete this tournament?")) return;
      setBusy(true);
      try { await deleteTournamentRemote(t.id); r.push('/'); r.refresh(); }
      finally { setBusy(false); }
      return;
    }
    await update(x => {
      x.players = x.players.filter(p => p.id !== me.id);
      x.pending = x.pending.filter(p => p.id !== me.id);
      x.coHosts = (x.coHosts ?? []).filter(id => id !== me.id);
      x.rounds = x.rounds.map(round =>
        round.map(m => ({
          ...m,
          a: m.a === me.id ? undefined : m.a,
          b: m.b === me.id ? undefined : m.b,
          winner: m.winner === me.id ? undefined : m.winner,
          reports: Object.fromEntries(Object.entries(m.reports || {}).filter(([k]) => k !== me.id)),
        }))
      );
    });
    r.push('/'); r.refresh();
  }

  async function startTournament() {
    if (busy || t.status !== 'setup') return;
    const local = seedLocal(t);
    setT(local);
    setBusy(true);
    try {
      const saved = await saveTournamentRemote(local);
      setT(saved); pollRef.current?.bump(); bumpAlerts();
    } catch {
      try {
        const latest = await getTournamentRemote(t.id);
        if (!latest) throw new Error('no-latest');
        const reseeded = seedLocal(latest);
        const saved = await saveTournamentRemote(reseeded);
        setT(saved); pollRef.current?.bump(); bumpAlerts();
      } catch {
        alert('Could not start bracket.');
      }
    } finally { setBusy(false); }
  }

  function hostSetWinner(roundIdx: number, matchIdx: number, winnerId?: string) {
    update(x => {
      const m = x.rounds?.[roundIdx]?.[matchIdx];
      if (!m) return;
      m.winner = winnerId;
      if (winnerId) buildNextRoundFromSync(x, roundIdx);
      (x as any).lastPingAt = undefined; (x as any).lastPingR = undefined; (x as any).lastPingM = undefined;
    });
  }

  function approve(pId: string) { update(x => approvePending(x, pId)); }
  function decline(pId: string) { update(x => declinePending(x, pId)); }

  // players modal actions
  function addPlayerPrompt() {
    const nm = prompt('Player name?');
    if (!nm) return;
    const p = { id: uid(), name: nm.trim() || 'Player' };
    update(x => { if (x.status === 'active') insertLatePlayer(x, p); else x.players.push(p); });
  }
  function renamePlayer(pid: string) {
    const cur = t.players.find(p => p.id === pid)?.name || '';
    const nm = prompt('Rename player', cur);
    if (!nm) return;
    update(x => { const p = x.players.find(pp => pp.id === pid); if (p) p.name = nm.trim() || p.name; });
  }
  function removePlayer(pid: string) {
    if (!confirm('Remove this player?')) return;
    update(x => {
      x.players = x.players.filter(p => p.id !== pid);
      x.pending = x.pending.filter(p => p.id !== pid);
      x.coHosts = (x.coHosts ?? []).filter(id => id !== pid);
      x.rounds = x.rounds.map(rr => rr.map(m => ({
        ...m,
        a: m.a === pid ? undefined : m.a,
        b: m.b === pid ? undefined : m.b,
        winner: m.winner === pid ? undefined : m.winner,
        reports: Object.fromEntries(Object.entries(m.reports || {}).filter(([k]) => k !== pid)),
      })));
    });
  }
  function toggleCoHost(pid: string) {
    update(x => {
      x.coHosts ??= [];
      if (x.coHosts.includes(pid)) x.coHosts = x.coHosts.filter(id => id !== pid);
      else x.coHosts.push(pid);
    });
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
              <div style={champ}>🎉 <b>Congratulations!</b> You won the tournament!</div>
            )}
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button style={btnGhost} onClick={() => setPlayersOpen(true)}>Players ({t.players.length})</button>
            <AlertsToggle />
            <button style={{ ...btnGhost, ...lock }} onClick={leaveTournament}>Leave Tournament</button>
          </div>
        </header>

        {/* How it works */}
        <section style={notice}>
          <b>How it works:</b> Tap <i>Start</i> to seed a single-elimination bracket.
          Players can self-report (<i>I won / I lost</i>). When all matches in a round have winners,
          the next round is created automatically until a champion is decided.
          Hosts can override winners with the <i>A wins / B wins / Clear</i> buttons.
        </section>

        {/* Host controls */}
        {iAmHost && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Host Controls</h3>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                defaultValue={t.name}
                onBlur={(e) => update(x => { const v = e.target.value.trim(); if (v) x.name = v; })}
                placeholder="Rename tournament"
                style={input}
                disabled={busy}
              />
              {t.status === 'setup' && (
                <button style={{ ...btn, ...lock }} onClick={startTournament}>
                  {busy ? 'Starting…' : 'Start (randomize bracket)'}
                </button>
              )}
              {t.status !== 'completed' && (
                <button
                  style={{ ...btnGhost, ...lock }}
                  onClick={async () => {
                    if (busy) return;
                    if (confirm('Delete tournament? This cannot be undone.')) {
                      setBusy(true);
                      try { await deleteTournamentRemote(t.id); r.push('/'); r.refresh(); }
                      finally { setBusy(false); }
                    }
                  }}
                >Delete</button>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <h4 style={{ margin: '6px 0' }}>Pending approvals ({t.pending?.length || 0})</h4>
              {(t.pending?.length || 0) === 0 ? (
                <div style={{ opacity: .7, fontSize: 13 }}>No pending players.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {t.pending!.map(p => (
                    <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px 12px', borderRadius: 10 }}>
                      <span>{p.name}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={{ ...btn, ...lock }} onClick={() => approve(p.id)}>Approve</button>
                        <button style={{ ...btnDanger, ...lock }} onClick={() => decline(p.id)}>Decline</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Bracket */}
        {t.rounds.length > 0 && (
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Bracket</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.rounds.length}, minmax(260px, 1fr))`, gap: 12, overflowX: 'auto' }}>
              {t.rounds.map((round, rIdx) => (
                <div key={rIdx} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ opacity: .8, fontSize: 13 }}>Round {rIdx + 1}</div>
                  {round.map((m, i) => {
                    const aName = t.players.find(p => p.id === m.a)?.name || (m.a ? '??' : 'BYE');
                    const bName = t.players.find(p => p.id === m.b)?.name || (m.b ? '??' : 'BYE');
                    const w = m.winner;
                    const iPlay = me && (m.a === me?.id || m.b === me?.id);
                    const canReport = iPlay && !w && t.status === 'active';

                    return (
                      <div key={i} style={{ background: '#111', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                        <div>{aName} vs {bName}</div>

                        {canHost && t.status !== 'completed' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems:'center' }}>
                            <button style={w === m.a ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.a)} disabled={busy}>A wins</button>
                            <button style={w === m.b ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.b)} disabled={busy}>B wins</button>
                            <button style={btnMini} onClick={() => hostSetWinner(rIdx, i, undefined)} disabled={busy}>Clear</button>

                            {/* Ping */}
                            <button
                              style={btnPing}
                              onClick={() => update(x => { (x as any).lastPingAt = Date.now(); (x as any).lastPingR = rIdx; (x as any).lastPingM = i; })}
                              disabled={busy}
                              title={`Ping ${aName}`}
                            >Ping A 🔔</button>
                            <button
                              style={btnPing}
                              onClick={() => update(x => { (x as any).lastPingAt = Date.now(); (x as any).lastPingR = rIdx; (x as any).lastPingM = i; })}
                              disabled={busy}
                              title={`Ping ${bName}`}
                            >Ping B 🔔</button>

                            {w && <span style={{ fontSize: 12, opacity: .8 }}>Winner: {t.players.find(p => p.id === w)?.name}</span>}
                          </div>
                        )}

                        {!canHost && canReport && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={btnMini} onClick={() => submitReport(t, rIdx, i, me!.id, 'win')} disabled={busy}>I won</button>
                            <button style={btnMini} onClick={() => submitReport(t, rIdx, i, me!.id, 'loss')} disabled={busy}>I lost</button>
                          </div>
                        )}
                        {!canHost && w && (
                          <div style={{ fontSize: 12, opacity: .8 }}>
                            Winner: {t.players.find(p => p.id === w)?.name}
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

      {/* PLAYERS MODAL */}
      {playersOpen && (
        <div style={modalWrap} onClick={() => setPlayersOpen(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
              <h3 style={{margin:0}}>Players ({t.players.length})</h3>
              <button style={btnGhost} onClick={() => setPlayersOpen(false)}>Close</button>
            </div>

            {canHost && (
              <div style={{display:'flex', gap:8, marginBottom:12}}>
                <button style={btn} onClick={addPlayerPrompt} disabled={busy}>Add player</button>
              </div>
            )}

            {t.players.length === 0 ? (
              <div style={{opacity:.7}}>No players yet.</div>
            ) : (
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8, maxHeight:'55vh', overflow:'auto' }}>
                {t.players.map(p => {
                  const isCH = (t.coHosts ?? []).includes(p.id);
                  return (
                    <li key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#111', padding:'10px 12px', borderRadius:10 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <span>{p.name}</span>
                        {p.id === t.hostId && <span style={roleBadge}>Host</span>}
                        {isCH && <span style={roleBadge}>Co-host</span>}
                      </div>
                      {canHost && (
                        <div style={{ display:'flex', gap:8 }}>
                          {iAmHost && p.id !== t.hostId && (
                            <button style={btnMini} onClick={() => toggleCoHost(p.id)} disabled={busy}>
                              {isCH ? 'Remove co-host' : 'Make co-host'}
                            </button>
                          )}
                          <button style={btnMini} onClick={() => renamePlayer(p.id)} disabled={busy}>Rename</button>
                          {p.id !== t.hostId && <button style={btnDanger} onClick={() => removePlayer(p.id)} disabled={busy}>Remove</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/* --------- styles --------- */
const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0b0b0b', color: '#fff', fontFamily: 'system-ui', padding: 24 };
const container: React.CSSProperties = { width: '100%', maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 18 };
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' };
const h1: React.CSSProperties = { margin: '8px 0 4px', fontSize: 24 };
const subhead: React.CSSProperties = { opacity: .75, fontSize: 14 };
const champ: React.CSSProperties = { marginTop: 8, padding: '10px 12px', borderRadius: 10, background: '#14532d', border: '1px solid #166534' };
const notice: React.CSSProperties = { background: 'rgba(14,165,233,.12)', border: '1px solid rgba(14,165,233,.25)', borderRadius: 12, padding: 10, margin: '8px 0 14px' };
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 14 };
const roleBadge: React.CSSProperties = { fontSize: 11, padding:'2px 6px', borderRadius:999, background:'rgba(56,189,248,.18)', border:'1px solid rgba(56,189,248,.35)' };
const btn: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', cursor: 'pointer' };
const btnDanger: React.CSSProperties = { ...btnGhost, borderColor: '#ff6b6b', color: '#ff6b6b' };
const btnMini: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 };
const btnActive: React.CSSProperties = { ...btnMini, background: '#0ea5e9', border: 'none' };
const btnPing: React.CSSProperties = { ...btnMini, background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.45)', color: '#38bdf8' };
const input: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#111', color: '#fff' };
const modalWrap: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'grid', placeItems:'center', zIndex:1000 };
const modalCard: React.CSSProperties = { width:'min(640px, 94vw)', background:'#0f0f0f', border:'1px solid rgba(255,255,255,.15)', borderRadius:12, padding:16 };
