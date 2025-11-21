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
  Tournament,
  uid,
  Match,
  getTournamentRemote,
} from '@/lib/storage';
import { startAdaptivePoll } from '@/lib/poll';

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
  for (const m of cur) { const nm = normalizeMatch(m); if (nm) normalized.push(nm); }
  t.rounds[roundIndex] = normalized;

  const winners = normalized.map(m => m.winner).filter(Boolean) as string[];
  if (normalized.some(m => !m.winner)) return;

  if (winners.length <= 1) { if (winners.length === 1) t.status = 'completed'; return; }
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const a = winners[i], b = winners[i + 1];
    const nm = normalizeMatch({ a, b, reports: {} });
    if (nm) next.push(nm);
  }
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next; else t.rounds.push(next);
  if (next.every(m => !!m.winner)) buildNextRoundFromSync(t, roundIndex + 1);
}

export default function Lobby() {
  const { id } = useParams<{ id: string }>();
  const r = useRouter();
  const [t, setT] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); }
    catch { return null; }
  }, []);
  useEffect(() => {
    if (!me) localStorage.setItem('kava_me', JSON.stringify({ id: uid(), name: 'Player' }));
  }, [me]);

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

  /* ---------- initial fetch (now captures x-t-version -> t.v) ---------- */
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      setErrMsg(null);
      try {
        const res = await fetch(`/api/tournament/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          const text = await res.text().catch(()=>'');
          if (!cancelled) setErrMsg(`HTTP ${res.status}${text ? ` • ${text}` : ''}`);
          return;
        }
        const json = await res.json();
        const vHeader = Number(res.headers.get('x-t-version') || '0');
        const withV = { ...json, v: Number.isFinite(vHeader) ? vHeader : (json.v ?? 0) };
        if (!cancelled) setT(withV);
      } catch (e:any) {
        if (!cancelled) setErrMsg(e?.message || 'Network error');
      }
    }
    if (id) loadInitial();
    return () => { cancelled = true; };
  }, [id]);

  /* ---------- adaptive ETag polling (one tab) ---------- */
  useEffect(() => {
    if (!id) return;
    pollRef.current?.stop();
    const poll = startAdaptivePoll<Tournament>({
      key: `t:${id}`,
      minMs: 4000,
      maxMs: 60000,
      fetchOnce: async (etag) => {
        const res = await fetch(`/api/tournament/${id}`, {
          headers: etag ? { 'If-None-Match': etag } : undefined,
          cache: 'no-store',
        });
        if (res.status === 304) return { status: 304, etag: etag ?? null };
        if (!res.ok) {
          console.warn('poll error', res.status);
          return { status: 304, etag: etag ?? null };
        }
        const payload = await res.json();
        const newTag = res.headers.get('etag') || res.headers.get('x-t-version') || null;
        const vHeader = Number(res.headers.get('x-t-version') || '0');
        const withV = { ...payload, v: Number.isFinite(vHeader) ? vHeader : (payload.v ?? 0) };
        return { status: 200, etag: newTag, payload: withV };
      },
      onChange: (payload) => setT(payload),
    });
    pollRef.current = poll;
    return () => poll.stop();
  }, [id]);

  if (!t) {
    return (
      <main style={wrap}>
        <div style={container}>
          <BackButton href="/" />
          {errMsg ? (
            <>
              <h3>Couldn’t load tournament</h3>
              <pre style={{ whiteSpace:'pre-wrap', opacity:.8 }}>{errMsg}</pre>
              <button style={btnGhost} onClick={() => window.location.reload()}>Try again</button>
            </>
          ) : (
            <p>Loading…</p>
          )}
        </div>
      </main>
    );
  }

  const coHosts = t.coHosts ?? [];
  const iAmHost = me?.id === t.hostId;
  const iAmCoHost = !!me && coHosts.includes(me.id);
  const canHost = iAmHost || iAmCoHost;

  async function update(mut: (x: Tournament) => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    const base: Tournament = {
      ...t,
      players: [...t.players],
      pending: [...t.pending],
      rounds: t.rounds.map(rr => rr.map(m => ({ ...m, reports: { ...(m.reports || {}) } }))),
      coHosts: [...coHosts],
      v: t.v, // carry version through
    };
    const first = structuredClone(base);
    try {
      await mut(first);
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
          rounds: latest.rounds.map(rr => rr.map(m => ({ ...m, reports: { ...(m.reports || {}) } }))),
          coHosts: [...(latest.coHosts ?? [])],
          v: latest.v,
        };
        await mut(second);
        const saved = await saveTournamentRemote(second);
        setT(saved); pollRef.current?.bump(); bumpAlerts();
      } catch {
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
        })),
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

  // ---- Pure local helpers (no remote save inside) ----
  function approveLocal(x: Tournament, playerId: string) {
    const idx = x.pending.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    const p = x.pending[idx];
    x.pending.splice(idx, 1);
    if (x.status === 'active') {
      const r0 = x.rounds[0] || [];
      let placed = false;
      for (const m of r0) {
        if (!m.a) { m.a = p.id; m.reports ??= {}; placed = true; break; }
        if (!m.b) { m.b = p.id; m.reports ??= {}; placed = true; break; }
      }
      if (!placed) {
        r0.push({ a: p.id, b: undefined, reports: {} });
        x.rounds[0] = r0;
      }
      buildNextRoundFromSync(x, 0);
    } else {
      if (!x.players.some(pp => pp.id === p.id)) x.players.push(p);
    }
  }
  function declineLocal(x: Tournament, playerId: string) {
    x.pending = x.pending.filter(p => p.id !== playerId);
  }
  function addLateLocal(x: Tournament, p: {id:string; name:string}) {
    if (x.status === 'active') {
      const r0 = x.rounds[0] || [];
      if (!x.players.find(pp => pp.id === p.id)) x.players.push(p);
      let placed = false;
      for (const m of r0) {
        if (!m.a) { m.a = p.id; m.reports ??= {}; placed = true; break; }
        if (!m.b) { m.b = p.id; m.reports ??= {}; placed = true; break; }
      }
      if (!placed) { r0.push({ a: p.id, b: undefined, reports: {} }); x.rounds[0] = r0; }
      buildNextRoundFromSync(x, 0);
    } else {
      if (!x.players.find(pp => pp.id === p.id)) x.players.push(p);
    }
  }
  function submitReportLocal(
    x: Tournament,
    roundIndex: number,
    matchIndex: number,
    playerId: string,
    result: 'win' | 'loss'
  ) {
    const m = x.rounds?.[roundIndex]?.[matchIndex];
    if (!m) return;
    m.reports ??= {};
    m.reports[playerId] = result;
    if (m.a && !m.b) m.winner = m.a;
    if (!m.a && m.b) m.winner = m.b;
    if (m.a && m.b) {
      const ra = m.reports[m.a], rb = m.reports[m.b];
      if (ra && rb) {
        if (ra === 'win' && rb === 'loss') m.winner = m.a;
        else if (ra === 'loss' && rb === 'win') m.winner = m.b;
      }
    }
    buildNextRoundFromSync(x, roundIndex);
  }

  function approve(pId: string)  { update(x => approveLocal(x, pId)); }
  function decline(pId: string)  { update(x => declineLocal(x, pId)); }
  function report(roundIdx: number, matchIdx: number, result: 'win' | 'loss') {
    if (!me) return;
    update(x => submitReportLocal(x, roundIdx, matchIdx, me.id, result));
  }

  function addPlayerPrompt() {
    const nm = prompt('Player name?');
    if (!nm) return;
    const p = { id: uid(), name: (nm.trim() || 'Player') };
    update(x => addLateLocal(x, p));
  }

  const lastRound = t.rounds.at(-1);
  const finalWinnerId = lastRound?.[0]?.winner;
  const iAmChampion = t.status === 'completed' && finalWinnerId === me?.id;
  const lock = { opacity: busy ? .6 : 1, pointerEvents: busy ? 'none' as const : 'auto' };

  const playersScrollable = t.players.length > 5;
  const playersBox: React.CSSProperties = playersScrollable ? { maxHeight: 260, overflowY: 'auto', paddingRight: 4 } : {};

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
            {iAmChampion && <div style={champ}>🎉 <b>Congratulations!</b> You won the tournament!</div>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
            <AlertsToggle />
            <button style={{ ...btnGhost, ...lock }} onClick={leaveTournament}>Leave Tournament</button>
          </div>
        </header>

        <section style={notice}>
          <b>How it works:</b> Tap <i>Start</i> to seed a single-elimination bracket.
          Players can self-report (<i>I won / I lost</i>). When all matches in a round have winners,
          the next round is created automatically until a champion is decided.
          Hosts can override winners with the <i>A wins / B wins / Clear</i> buttons.
          Drag player pills in <b>Round 1</b> to rearrange matchups.
        </section>

        {/* Players */}
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Players ({t.players.length})</h3>
          {canHost && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
              <button style={{ ...btn, ...lock }} onClick={addPlayerPrompt}>Add player</button>
            </div>
          )}
          {t.players.length === 0 ? (
            <div style={{ opacity:.7 }}>No players yet.</div>
          ) : (
            <div style={playersBox}>
              <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
                {t.players.map(p => {
                  const isCH = coHosts.includes(p.id);
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
                            <button style={btnMini} onClick={() => {
                              update(x => {
                                x.coHosts ??= [];
                                if (x.coHosts.includes(p.id)) x.coHosts = x.coHosts.filter(id => id !== p.id);
                                else x.coHosts.push(p.id);
                              });
                            }} disabled={busy}>
                              {isCH ? 'Remove co-host' : 'Make co-host'}
                            </button>
                          )}
                          <button style={btnMini} onClick={() => {
                            const cur = t.players.find(pp => pp.id === p.id)?.name || '';
                            const nm = prompt('Rename player', cur);
                            if (!nm) return;
                            update(x => { const pp = x.players.find(z => z.id === p.id); if (pp) pp.name = nm.trim() || pp.name; });
                          }} disabled={busy}>Rename</button>
                          {p.id !== t.hostId && <button style={btnDanger} onClick={() => {
                            if (!confirm('Remove this player?')) return;
                            update(x => {
                              x.players = x.players.filter(pp => pp.id !== p.id);
                              x.pending = x.pending.filter(pp => pp.id !== p.id);
                              x.coHosts = (x.coHosts ?? []).filter(id => id !== p.id);
                              x.rounds = x.rounds.map(rr => rr.map(m => ({
                                ...m,
                                a: m.a === p.id ? undefined : m.a,
                                b: m.b === p.id ? undefined : m.b,
                                winner: m.winner === p.id ? undefined : m.winner,
                                reports: Object.fromEntries(Object.entries(m.reports || {}).filter(([k]) => k !== p.id)),
                              })));
                            });
                          }} disabled={busy}>Remove</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
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
                    const canReport = !canHost && iPlay && !w && t.status === 'active';

                    // Drag & drop Round 1 seats
                    type DragInfo = { type: 'seat'; round: number; match: number; side: 'a' | 'b'; pid?: string };
                    function onDragStart(ev: React.DragEvent, info: DragInfo) {
                      ev.dataTransfer.setData('application/json', JSON.stringify(info));
                      ev.dataTransfer.effectAllowed = 'move';
                    }
                    function onDragOver(ev: React.DragEvent) { ev.preventDefault(); }
                    function onDrop(ev: React.DragEvent, target: DragInfo) {
                      ev.preventDefault();
                      const raw = ev.dataTransfer.getData('application/json');
                      if (!raw) return;
                      let src: DragInfo;
                      try { src = JSON.parse(raw); } catch { return; }
                      if (src.type !== 'seat' || target.type !== 'seat') return;
                      if (t.status === 'completed' || src.round !== 0 || target.round !== 0) return;

                      update(x => {
                        const mSrc = x.rounds?.[0]?.[src.match];
                        const mTgt = x.rounds?.[0]?.[target.match];
                        if (!mSrc || !mTgt) return;

                        const clear = (mm: Match) => { mm.winner = undefined; mm.reports = {}; };
                        clear(mSrc); clear(mTgt);

                        const valSrc = (mSrc as any)[src.side] as string | undefined;
                        const valTgt = (mTgt as any)[target.side] as string | undefined;
                        (mSrc as any)[src.side] = valTgt;
                        (mTgt as any)[target.side] = valSrc;

                        x.rounds = [x.rounds[0]];
                        buildNextRoundFromSync(x, 0);
                      });
                    }
                    function pill(pid?: string, round?: number, match?: number, side?: 'a' | 'b') {
                      const name = pid ? (t.players.find(p => p.id === pid)?.name || '??') : '—';
                      const draggable = canHost && t.status !== 'completed' && round === 0;
                      const info: DragInfo = { type: 'seat', round: round!, match: match!, side: side!, pid };
                      return (
                        <span
                          draggable={draggable}
                          onDragStart={e => onDragStart(e, info)}
                          onDragOver={onDragOver}
                          onDrop={e => onDrop(e, info)}
                          style={{ ...pillStyle, opacity: pid ? 1 : .6, cursor: draggable ? 'grab' : 'default' }}
                          title={draggable ? 'Drag to swap seats in Round 1' : undefined}
                        >
                          {name}
                        </span>
                      );
                    }

                    return (
                      <div key={i} style={{ background: '#111', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                          {pill(m.a, rIdx, i, 'a')}
                          <span style={{ opacity:.7 }}>vs</span>
                          {pill(m.b, rIdx, i, 'b')}
                        </div>

                        {canHost && t.status !== 'completed' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems:'center' }}>
                            <button style={w === m.a ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.a)} disabled={busy}>A wins</button>
                            <button style={w === m.b ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.b)} disabled={busy}>B wins</button>
                            <button style={btnMini} onClick={() => hostSetWinner(rIdx, i, undefined)} disabled={busy}>Clear</button>

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
                            <button style={btnMini} onClick={() => report(rIdx, i, 'win')} disabled={busy}>I won</button>
                            <button style={btnMini} onClick={() => report(rIdx, i, 'loss')} disabled={busy}>I lost</button>
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
const pillStyle: React.CSSProperties = { padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', minWidth:40, textAlign:'center' };
