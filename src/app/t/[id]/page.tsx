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
  TournamentSettings,
  Team,
  GroupRecord,
  GroupMatch,
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
function normalizeSettings(s?: TournamentSettings): TournamentSettings {
  const format = s?.format || 'single_elim';
  const matchType = s?.groups?.matchType || (format === 'doubles' ? 'doubles' : 'singles');
  return {
    format,
    teamSize: s?.teamSize ? Math.max(1, s.teamSize) : (matchType === 'doubles' ? 2 : 1),
    bracketStyle: s?.bracketStyle || 'single_elim',
    groups: format === 'groups'
      ? {
          count: s?.groups?.count || 4,
          size: s?.groups?.size || 4,
          matchType,
          advancement: s?.groups?.advancement === 'wins' ? 'wins' : 'points',
          losersNext: !!s?.groups?.losersNext,
        }
      : undefined,
  };
}
function normalizeMatch(m: Match, valid?: Set<string>): Match | null {
  const a = m.a && valid?.has(m.a) === false ? undefined : m.a;
  const b = m.b && valid?.has(m.b) === false ? undefined : m.b;
  const winner = m.winner && valid?.has(m.winner) === false ? undefined : m.winner;
  if (!a && !b) return null;
  if (a && !b) return { ...m, a, b, winner: a, reports: m.reports ?? {} };
  if (!a && b) return { ...m, a, b, winner: b, reports: m.reports ?? {} };
  return { ...m, a, b, winner, reports: m.reports ?? {} };
}
function mergeTeams(players: { id: string; name: string }[], settings: TournamentSettings, prev?: Team[]): Team[] {
  const teamSize = Math.max(1, settings.teamSize || 1);
  const prevByKey = new Map<string, Team>();
  (prev || []).forEach((tm) => {
    const key = [...tm.memberIds].sort().join('|');
    prevByKey.set(key, tm);
  });

  const teams: Team[] = [];
  for (let i = 0; i < players.length; i += teamSize) {
    const slice = players.slice(i, i + teamSize);
    const memberIds = slice.map((p) => p.id);
    const key = [...memberIds].sort().join('|');
    const existing = prevByKey.get(key);
    const name = slice.map((p) => p.name).join(' / ') || 'Team';
    teams.push(
      existing
        ? { ...existing, memberIds, name: existing.name || name }
        : { id: memberIds.length === 1 ? memberIds[0] : `team-${uid()}`, name, memberIds }
    );
  }
  return teams;
}
function seedLocal(t: Tournament): Tournament {
  const settings = normalizeSettings(t.settings);
  const teams = mergeTeams(t.players, settings, t.teams);
  const seededGroups = settings.format === 'groups' ? buildGroups(teams, settings, { randomize: true }) : undefined;
  const seededMatches = seededGroups ? createGroupMatches(seededGroups, []) : undefined;
  const seededRecords = seededGroups && seededMatches
    ? computeGroupRecords(seededGroups, seededMatches, teams)
    : undefined;

  if (settings.format === 'groups') {
    return {
      ...t,
      teams,
      rounds: [],
      status: 'active',
      groupStage: seededGroups
        ? { groups: seededGroups, records: seededRecords, matches: seededMatches }
        : undefined,
    };
  }

  const ids = shuffle(teams.map((tm) => tm.id));
  const first: Match[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i], b = ids[i + 1];
    const nm = normalizeMatch({ a, b, reports: {} });
    if (nm) first.push(nm);
  }
  const seeded: Tournament = { ...t, teams, rounds: [first], status: 'active' };
  buildNextRoundFromSync(seeded, 0);
  return seeded;
}
function buildGroups(teams: Team[], settings: TournamentSettings, opts?: { randomize?: boolean }): string[][] {
  const size = settings.groups?.size || 4;
  const desiredCount = settings.groups?.count || Math.max(1, Math.ceil(Math.max(teams.length, 1) / size));
  const groups: string[][] = Array.from({ length: desiredCount || 1 }, () => []);
  const pool = opts?.randomize ? shuffle(teams) : teams;

  pool.forEach((tm) => {
    const target = groups.reduce(
      (best, g, idx) => (g.length < best[0] ? [g.length, idx] : best),
      [Number.MAX_SAFE_INTEGER, 0] as [number, number]
    );
    groups[target[1]].push(tm.id);
  });
  return groups;
}
function createGroupMatches(groups: string[][], prev?: GroupMatch[]): GroupMatch[] {
  const prevByKey = new Map<string, GroupMatch>();
  const makeKey = (gIdx: number, a?: string, b?: string) => `${gIdx}:${[a, b].filter(Boolean).sort().join('|')}`;
  (prev || []).forEach((m) => {
    if (!m.a || !m.b) return;
    prevByKey.set(makeKey(m.group, m.a, m.b), m);
  });

  const matches: GroupMatch[] = [];
  groups.forEach((group, gIdx) => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const existing = prevByKey.get(makeKey(gIdx, a, b));
        matches.push({
          id: existing?.id || `gm-${uid()}`,
          group: gIdx,
          a,
          b,
          scoreA: existing?.scoreA,
          scoreB: existing?.scoreB,
          winner: existing?.winner,
        });
      }
    }
  });
  return matches;
}
function computeGroupRecords(groups: string[][], matches: GroupMatch[], teams: Team[]): Record<string, GroupRecord> {
  const recs: Record<string, GroupRecord> = {};
  const ensure = (id?: string) => {
    if (!id) return;
    recs[id] ??= { points: 0, wins: 0, losses: 0, played: 0, gamesWon: 0, gamesLost: 0 };
  };
  groups.forEach((g) => g.forEach((id) => ensure(id)));

  matches.forEach((m) => {
    if (!m.a || !m.b) return;
    ensure(m.a); ensure(m.b);
    const aScore = Number.isFinite(m.scoreA) ? Number(m.scoreA) : null;
    const bScore = Number.isFinite(m.scoreB) ? Number(m.scoreB) : null;
    if (aScore === null || bScore === null) return;

    recs[m.a].gamesWon += aScore;
    recs[m.a].gamesLost += bScore;
    recs[m.b].gamesWon += bScore;
    recs[m.b].gamesLost += aScore;
    recs[m.a].played += 1;
    recs[m.b].played += 1;

    if (aScore > bScore) {
      recs[m.a].wins += 1; recs[m.b].losses += 1; m.winner = m.a;
    } else if (bScore > aScore) {
      recs[m.b].wins += 1; recs[m.a].losses += 1; m.winner = m.b;
    } else {
      m.winner = undefined;
    }
  });
  Object.values(recs).forEach((r) => { r.points = r.wins * 3; });
  return recs;
}
function mergeManualRecords(
  computed: Record<string, GroupRecord>,
  manual?: Record<string, GroupRecord>
): Record<string, GroupRecord> {
  if (!manual) return computed;
  const merged: Record<string, GroupRecord> = { ...computed };
  Object.entries(manual).forEach(([id, rec]) => {
    merged[id] = merged[id] ? { ...merged[id], ...rec } : { ...rec };
  });
  return merged;
}
function groupStageComplete(stage?: { matches?: GroupMatch[] }) {
  if (!stage?.matches?.length) return false;
  return stage.matches.every(
    (m) =>
      !!m.a &&
      !!m.b &&
      Number.isFinite(m.scoreA) &&
      Number.isFinite(m.scoreB) &&
      !!m.winner
  );
}
function ensureGroupStage(t: Tournament, settings: TournamentSettings) {
  if (settings.format !== 'groups') { t.groupStage = undefined; return undefined; }
  const baseGroups = t.groupStage?.groups?.length ? t.groupStage.groups : buildGroups(t.teams || [], settings);
  const matches = createGroupMatches(
    baseGroups,
    (t.groupStage?.matches || []).filter((m) => baseGroups[m.group] && baseGroups[m.group].includes(m.a || '') && baseGroups[m.group].includes(m.b || ''))
  );
  const computed = computeGroupRecords(baseGroups, matches, t.teams || []);
  const records = mergeManualRecords(computed, t.groupStage?.records);
  t.groupStage = { groups: baseGroups, records, matches };
  return t.groupStage;
}
function rankGroupMembers(
  groupIds: string[],
  records: Record<string, GroupRecord>,
  teams: Team[],
  advancement: 'points' | 'wins'
) {
  const nm = (id?: string) => teams.find((tm) => tm.id === id)?.name || '';
  return [...groupIds].sort((a, b) => {
    const ra = records[a] || { points: 0, wins: 0, losses: 0, played: 0, gamesWon: 0, gamesLost: 0 };
    const rb = records[b] || { points: 0, wins: 0, losses: 0, played: 0, gamesWon: 0, gamesLost: 0 };
    const diffA = (ra.gamesWon || 0) - (ra.gamesLost || 0);
    const diffB = (rb.gamesWon || 0) - (rb.gamesLost || 0);
    if (advancement === 'wins') {
      if (ra.wins !== rb.wins) return rb.wins - ra.wins;
    } else if (ra.points !== rb.points) {
      return rb.points - ra.points;
    }
    if (diffA !== diffB) return diffB - diffA;
    if ((ra.gamesWon || 0) !== (rb.gamesWon || 0)) return (rb.gamesWon || 0) - (ra.gamesWon || 0);
    if (ra.wins !== rb.wins) return rb.wins - ra.wins;
    if (ra.losses !== rb.losses) return ra.losses - rb.losses;
    return nm(a).localeCompare(nm(b));
  });
}
function buildSeedsFromGroups(
  groups: string[][],
  records: Record<string, GroupRecord>,
  teams: Team[],
  advancement: 'points' | 'wins'
) {
  const ranked = groups.map((g) => rankGroupMembers(g, records, teams, advancement));
  const seeds: string[] = [];

  if (advancement === 'wins') {
    ranked.forEach((g) => { if (g[0]) seeds.push(g[0]); });
    return seeds.filter(Boolean);
  }

  for (let i = 0; i < ranked.length; i += 2) {
    const gA = ranked[i];
    const gB = ranked[i + 1];
    if (gA?.length) {
      if (gA[0]) seeds.push(gA[0]);
      if (gB?.[1]) seeds.push(gB[1]);
      if (gB?.[0]) seeds.push(gB[0]);
      if (gA[1]) seeds.push(gA[1]);
    } else if (gB?.length) {
      if (gB[0]) seeds.push(gB[0]);
      if (gB[1]) seeds.push(gB[1]);
    }
  }
  if (ranked.length === 1) seeds.push(...ranked[0].slice(1));
  return seeds.filter(Boolean);
}
function rebuildBracketFromGroups(t: Tournament, settings: TournamentSettings) {
  const stage = ensureGroupStage(t, settings);
  if (!stage) return;
  if (!groupStageComplete(stage)) {
    t.rounds = [];
    t.status = t.status === 'completed' ? 'completed' : 'active';
    return;
  }
  const seeds = buildSeedsFromGroups(stage.groups, stage.records || {}, t.teams || [], settings.groups?.advancement || 'points');
  if (!seeds.length) return;
  const first: Match[] = [];
  for (let i = 0; i < seeds.length; i += 2) {
    const a = seeds[i], b = seeds[i + 1];
    const nm = normalizeMatch({ a, b, reports: {} });
    if (nm) first.push(nm);
  }
  t.rounds[0] = first;
  clearRoundsFrom(t, 0);
  buildNextRoundFromSync(t, 0);
}
function clearRoundsFrom(t: Tournament, roundIndex: number) {
  for (let r = roundIndex; r < t.rounds.length; r++) {
    t.rounds[r] = (t.rounds[r] || []).map((m) => ({ ...m, winner: undefined, reports: {} }));
  }
  if (roundIndex < t.rounds.length - 1) t.rounds = t.rounds.slice(0, roundIndex + 1);
  if (t.status === 'completed') t.status = 'active';
}
function buildNextRoundFromSync(t: Tournament, roundIndex: number) {
  const valid = new Set((t.teams || []).map((tm) => tm.id));
  const cur = t.rounds[roundIndex] || [];
  const normalized: Match[] = [];
  for (const m of cur) { const nm = normalizeMatch(m, valid); if (nm) normalized.push(nm); }
  t.rounds[roundIndex] = normalized;

  const winners = normalized.map(m => m.winner).filter(Boolean) as string[];
  if (normalized.some(m => !m.winner)) { t.rounds = t.rounds.slice(0, roundIndex + 1); return; }

  if (winners.length <= 1) { if (winners.length === 1) t.status = 'completed'; return; }
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const a = winners[i], b = winners[i + 1];
    const nm = normalizeMatch({ a, b, reports: {} }, valid);
    if (nm) next.push(nm);
  }
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next; else t.rounds.push(next);
  if (next.every(m => !!m.winner)) buildNextRoundFromSync(t, roundIndex + 1);
}
function reconcileTeams(t: Tournament) {
  const settings = normalizeSettings(t.settings);
  t.settings = settings;
  t.teams = mergeTeams(t.players, settings, t.teams);
  const valid = new Set((t.teams || []).map((tm) => tm.id));
  if (settings.format === 'groups') {
    const safeGroups = t.groupStage?.groups?.map(g => g.filter(id => valid.has(id)));
    const groups = safeGroups && safeGroups.length ? safeGroups : buildGroups(t.teams || [], settings);
    const matches = createGroupMatches(groups, (t.groupStage?.matches || []).filter((m) => valid.has(m.a || '') && valid.has(m.b || '')));
    const computed = computeGroupRecords(groups, matches, t.teams || []);
    const records = mergeManualRecords(computed, t.groupStage?.records);
    t.groupStage = { groups, matches, records };
  } else {
    t.groupStage = undefined;
  }
  if (settings.format === 'groups' && (!t.rounds.length || t.status === 'setup')) {
    rebuildBracketFromGroups(t, settings);
  }
  t.rounds = (t.rounds || []).map((round) =>
    round
      .map((m) => normalizeMatch(m, valid))
      .filter(Boolean)
      .map((m) => ({ ...m!, reports: { ...(m!.reports || {}) } })) as Match[]
  );
  if (t.rounds.length && t.status !== 'setup') buildNextRoundFromSync(t, 0);
}
function seatTeamIntoFirstRound(t: Tournament, teamId?: string) {
  if (!teamId) return;
  t.rounds[0] ??= [];
  const already = t.rounds[0].some((m) => m.a === teamId || m.b === teamId);
  if (already) return;
  for (const m of t.rounds[0]) {
    if (!m.a) { m.a = teamId; clearRoundsFrom(t, 0); buildNextRoundFromSync(t, 0); return; }
    if (!m.b) { m.b = teamId; clearRoundsFrom(t, 0); buildNextRoundFromSync(t, 0); return; }
  }
  t.rounds[0].push({ a: teamId, b: undefined, reports: {} });
  clearRoundsFrom(t, 0);
  buildNextRoundFromSync(t, 0);
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

  async function update(mut: (x: Tournament) => void | Promise<void>, opts?: { blockUI?: boolean }) {
    const blockUI = opts?.blockUI ?? true;
    if (busy && blockUI) return;
    if (blockUI) setBusy(true);

    const base: Tournament = {
      ...t,
      players: [...t.players],
      pending: [...t.pending],
      rounds: t.rounds.map(rr => rr.map(m => ({ ...m, reports: { ...(m.reports || {}) } }))),
      coHosts: [...coHosts],
      teams: [...(t.teams || [])].map(tm => ({ ...tm, memberIds: [...tm.memberIds] })),
      settings: normalizeSettings(t.settings),
      groupStage: t.groupStage ? { groups: t.groupStage.groups.map(g => [...g]), records: { ...(t.groupStage.records || {}) } } : undefined,
      v: t.v, // carry version through
    };

    const first = structuredClone(base);
    const apply = async (draft: Tournament) => {
      await mut(draft);
      reconcileTeams(draft);
      setT(draft); // optimistic so buttons feel instant
      const saved = await saveTournamentRemote(draft);
      setT(saved); pollRef.current?.bump(); bumpAlerts();
    };

    try {
      await apply(first);
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
          teams: [...(latest.teams || [])].map(tm => ({ ...tm, memberIds: [...tm.memberIds] })),
          settings: normalizeSettings(latest.settings),
          groupStage: latest.groupStage ? { groups: latest.groupStage.groups.map(g => [...g]), records: { ...(latest.groupStage.records || {}) } } : undefined,
          v: latest.v,
        };
        await apply(second);
      } catch {
        alert('Could not save changes.');
      }
    } finally { if (blockUI) setBusy(false); }
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
    }, { blockUI: false });
  }

  // ---- Pure local helpers (no remote save inside) ----
  function approveLocal(x: Tournament, playerId: string) {
    const idx = x.pending.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    const p = x.pending[idx];
    x.pending.splice(idx, 1);
    if (!x.players.some(pp => pp.id === p.id)) x.players.push(p);

    const settings = normalizeSettings(x.settings);
    x.settings = settings;
    x.teams = mergeTeams(x.players, settings, x.teams);

    if (x.status === 'active') {
      const teamId = (x.teams || []).find((tm) => tm.memberIds.includes(p.id))?.id;
      seatTeamIntoFirstRound(x, teamId);
    }
  }
  function declineLocal(x: Tournament, playerId: string) {
    x.pending = x.pending.filter(p => p.id !== playerId);
  }
  function addLateLocal(x: Tournament, p: {id:string; name:string}, groupIndex?: number) {
    if (!x.players.find(pp => pp.id === p.id)) x.players.push(p);

    const settings = normalizeSettings(x.settings);
    x.settings = settings;
    x.teams = mergeTeams(x.players, settings, x.teams);

    if (x.status === 'active') {
      const teamId = (x.teams || []).find((tm) => tm.memberIds.includes(p.id))?.id;
      if (settings.format === 'groups' && x.groupStage?.groups) {
        const stage = ensureGroupStage(x, settings);
        const targetIdx = Number.isFinite(groupIndex)
          ? Math.max(0, Math.min(stage?.groups.length ? stage.groups.length - 1 : 0, Number(groupIndex)))
          : (() => {
              const sizes = stage?.groups.map((g, idx) => [g.length, idx] as [number, number]) || [];
              const min = sizes.reduce((m, [len]) => Math.min(m, len), Number.MAX_SAFE_INTEGER);
              const smallest = sizes.filter(([len]) => len === min).map(([, idx]) => idx);
              if (!smallest.length) return 0;
              return smallest[Math.floor(Math.random() * smallest.length)] ?? 0;
            })();
        if (stage) {
          stage.groups[targetIdx] = stage.groups[targetIdx] || [];
          if (teamId || p.id) stage.groups[targetIdx].push(teamId || p.id);
          stage.matches = createGroupMatches(stage.groups, stage.matches);
          const computed = computeGroupRecords(stage.groups, stage.matches || [], x.teams || []);
          stage.records = mergeManualRecords(computed, stage.records);
          rebuildBracketFromGroups(x, settings);
        }
      } else {
        seatTeamIntoFirstRound(x, teamId);
      }
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
    const teams = x.teams || [];
    const verdictForTeam = (teamId?: string) => {
      if (!teamId) return undefined;
      const team = teams.find((tm) => tm.id === teamId);
      if (!team) return undefined;
      for (const pid of team.memberIds) {
        const vote = m.reports?.[pid];
        if (vote) return vote;
      }
      return undefined;
    };
    if (m.a && !m.b) m.winner = m.a;
    if (!m.a && m.b) m.winner = m.b;
    if (m.a && m.b) {
      const ra = verdictForTeam(m.a), rb = verdictForTeam(m.b);
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
    const nm = prompt('Player or team name?');
    if (!nm) return;
    const p = { id: uid(), name: (nm.trim() || 'Player') };
    const settingsNow = normalizeSettings(t.settings);
    let targetGroup: number | undefined = undefined;
    if (settingsNow.format === 'groups') {
      const choice = prompt('Add to which group? (A, B, C…) Leave blank to auto-balance.');
      if (choice && choice.trim()) {
        const letter = choice.trim().toUpperCase();
        const idx = letter.charCodeAt(0) - 65;
        if (Number.isFinite(idx) && idx >= 0) targetGroup = idx;
      }
    }
    update(x => addLateLocal(x, p, targetGroup));
  }
  function moveTeamBetweenGroups(teamId: string, fromGroup: number, toGroup: number) {
    update((x) => {
      const settings = normalizeSettings(x.settings);
      if (settings.format !== 'groups') return;
      const stage = ensureGroupStage(x, settings);
      if (!stage?.groups?.[fromGroup] || !stage.groups[toGroup]) return;
      if (fromGroup === toGroup) return;
      const from = stage.groups[fromGroup];
      const idx = from.indexOf(teamId);
      if (idx < 0) return;
      from.splice(idx, 1);
      if (!stage.groups[toGroup].includes(teamId)) stage.groups[toGroup].push(teamId);
      stage.matches = createGroupMatches(stage.groups, stage.matches);
      const computed = computeGroupRecords(stage.groups, stage.matches, x.teams || []);
      stage.records = mergeManualRecords(computed, stage.records);
      rebuildBracketFromGroups(x, settings);
    });
  }
  function randomizeGroupsFromPlayers() {
    update((x) => {
      const settings = normalizeSettings(x.settings);
      if (settings.format !== 'groups') return;
      x.settings = settings;
      x.teams = mergeTeams(x.players, settings, x.teams);
      const groups = buildGroups(x.teams || [], settings, { randomize: true });
      const matches = createGroupMatches(groups, []);
      const computed = computeGroupRecords(groups, matches, x.teams || []);
      x.groupStage = { groups, matches, records: mergeManualRecords(computed, x.groupStage?.records) };
      x.rounds = [];
      if (x.status === 'completed') x.status = 'active';
    });
  }

  const settings = normalizeSettings(t.settings);
  const teamsForDisplay = t.teams?.length ? t.teams : mergeTeams(t.players, settings, t.teams);
  const teamName = (teamId?: string) => {
    if (!teamId) return '—';
    const team = teamsForDisplay.find((tm) => tm.id === teamId);
    if (!team) return '??';
    const names = team.memberIds.map((pid) => t.players.find((p) => p.id === pid)?.name || '??');
    return team.name || names.join(' / ');
  };
  const groupLabel = (idx: number) => `Group ${String.fromCharCode(65 + idx)}`;
  const teamHasPlayer = (teamId?: string, playerId?: string) => {
    if (!teamId || !playerId) return false;
    const team = teamsForDisplay.find((tm) => tm.id === teamId);
    return !!team?.memberIds.includes(playerId);
  };
  const groupStage = (() => {
    if (settings.format !== 'groups') return null;
    const groups = t.groupStage?.groups?.length ? t.groupStage.groups : buildGroups(teamsForDisplay, settings);
    const matches = createGroupMatches(groups, t.groupStage?.matches || []);
    const computed = computeGroupRecords(groups, matches, teamsForDisplay);
    const records = mergeManualRecords(computed, t.groupStage?.records);
    return { groups, records, matches };
  })();
  const rankedGroups = groupStage
    ? groupStage.groups.map((g) => rankGroupMembers(g, groupStage.records, teamsForDisplay, settings.groups?.advancement || 'points'))
    : ([] as string[][]);
  const seedLabels = new Map<string, string>();
  if (settings.format === 'groups') {
    rankedGroups.forEach((g, idx) => {
      g.forEach((teamId, pos) => {
        seedLabels.set(teamId, `${String.fromCharCode(65 + idx)}${pos + 1}`);
      });
    });
  }
  function adjustGroupRecord(teamId: string, key: keyof GroupRecord, delta: number) {
    update((x) => {
      const nextSettings = normalizeSettings(x.settings);
      const stage = ensureGroupStage(x, nextSettings);
      if (!stage?.records?.[teamId]) return;
      stage.records[teamId][key] = Math.max(0, (stage.records[teamId][key] || 0) + delta);
      stage.records[teamId].gamesWon ??= 0; stage.records[teamId].gamesLost ??= 0;
      if (key === 'wins' || key === 'losses') {
        stage.records[teamId].played = Math.max(stage.records[teamId].played, (stage.records[teamId].wins || 0) + (stage.records[teamId].losses || 0));
      }
      stage.records[teamId].points = (stage.records[teamId].wins || 0) * 3;
      rebuildBracketFromGroups(x, nextSettings);
    }, { blockUI: false });
  }
  function setGroupMatchScore(matchId: string, aScore: number | null, bScore: number | null) {
    update((x) => {
      const nextSettings = normalizeSettings(x.settings);
      const stage = ensureGroupStage(x, nextSettings);
      if (!stage?.matches) return;
      const match = stage.matches.find((m) => m.id === matchId);
      if (!match) return;
      match.scoreA = aScore === null ? undefined : Math.max(0, aScore);
      match.scoreB = bScore === null ? undefined : Math.max(0, bScore);
      const computed = computeGroupRecords(stage.groups, stage.matches, x.teams || []);
      stage.records = mergeManualRecords(computed, stage.records);
      rebuildBracketFromGroups(x, nextSettings);
    }, { blockUI: false });
  }
  const formatLabel = (() => {
    switch (settings.format) {
      case 'doubles': return 'Doubles (2v2)';
      case 'groups': return 'Groups / Pools';
      case 'singles': return 'Singles';
      default: return 'Single elimination';
    }
  })();
  const myTeams = me ? teamsForDisplay.filter((tm) => tm.memberIds.includes(me.id)).map((tm) => tm.id) : [];
  const lastRound = t.rounds.at(-1);
  const finalWinnerId = lastRound?.[0]?.winner;
  const iAmChampion = t.status === 'completed' && finalWinnerId && myTeams.includes(finalWinnerId);
  const lock = { opacity: busy ? .6 : 1, pointerEvents: busy ? 'none' as const : 'auto' };
  const roundName = (idx: number, total: number) => {
    if (total === 1 || idx === total - 1) return 'Final';
    if (idx === total - 2) return 'Semifinal';
    if (idx === total - 3) return 'Quarterfinal';
    return `Round ${idx + 1}`;
  };
  const allowGroupDrag = canHost && t.status !== 'completed' && settings.format === 'groups';
  type GroupDragPayload = { type: 'group-seat'; teamId: string; from: number };

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
              {t.code ? <>Private code: <b>{t.code}</b></> : 'Public tournament'} • {t.players.length} {t.players.length === 1 ? 'player' : 'players'} • {formatLabel}
            </div>
            {iAmChampion && <div style={champ}>🎉 <b>Congratulations!</b> You won the tournament!</div>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
            <AlertsToggle />
            <button style={{ ...btnGhost, ...lock }} onClick={leaveTournament}>Leave Tournament</button>
          </div>
        </header>

        <section style={notice}>
          <b>How it works:</b> Tap <i>Start</i> to seed the bracket using the selected format.
          Players can self-report (<i>I won / I lost</i>). When all matches in a round have winners,
          the next round is created automatically until a champion is decided.
          Hosts can override winners with the <i>A wins / B wins / Clear</i> buttons.
          Drag player pills in <b>any round</b> to fix placements or swap matchups.
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

            <div style={{ display:'grid', gap:6, marginBottom:12 }}>
              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:13, opacity:.8 }}>Format</span>
                <select
                  value={settings.format}
                  onChange={(e) => {
                    const fmt = e.target.value as TournamentSettings['format'];
                    update(x => {
                      if (x.status !== 'setup') return;
                      const base = normalizeSettings({ ...x.settings, format: fmt });
                      const teamSize = fmt === 'groups'
                        ? (base.groups?.matchType === 'doubles' ? 2 : 1)
                        : fmt === 'doubles'
                          ? 2
                          : 1;
                      const nextSettings = normalizeSettings({ ...x.settings, format: fmt, teamSize });
                      x.settings = nextSettings;
                      x.teams = mergeTeams(x.players, nextSettings, x.teams);
                      x.rounds = [];
                      x.groupStage = fmt === 'groups' ? { groups: buildGroups(x.teams || [], nextSettings) } : undefined;
                    });
                  }}
                  disabled={busy || t.status !== 'setup'}
                  style={input}
                >
                  <option value="single_elim">Standard bracket (single elimination)</option>
                  <option value="singles">Singles (1v1 flexible)</option>
                  <option value="doubles">Doubles (2v2 teams)</option>
                  <option value="groups">Groups / Pools</option>
                </select>
              </label>
              <div style={{ fontSize:12, opacity:.7 }}>
                Team size: {settings.teamSize} • Bracket: {settings.bracketStyle.replace('_',' ')}
              </div>
              {settings.format === 'groups' && (
                <div style={{ display:'grid', gap:10, padding:10, borderRadius:10, background:'rgba(14,165,233,0.08)', border:'1px solid rgba(14,165,233,0.2)' }}>
                  <div style={{ fontWeight:700 }}>Group Pools options</div>
                  <div style={{ display:'grid', gap:6 }}>
                    <span style={{ fontSize:13, opacity:.85 }}>Match type</span>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {(['singles','doubles'] as const).map(mt => (
                        <button
                          key={mt}
                          style={settings.groups?.matchType === mt ? btnActive : btnMini}
                          disabled={busy || t.status !== 'setup'}
                          onClick={() => update(x => {
                            if (x.status !== 'setup') return;
                            const current = normalizeSettings(x.settings);
                            const nextSettings = normalizeSettings({
                              ...x.settings,
                              format: 'groups',
                              teamSize: mt === 'doubles' ? 2 : 1,
                              groups: { ...(current.groups || {}), matchType: mt },
                            });
                            x.settings = nextSettings;
                            x.teams = mergeTeams(x.players, nextSettings, x.teams);
                            x.rounds = [];
                            x.groupStage = { groups: buildGroups(x.teams || [], nextSettings) };
                          })}
                        >
                          {mt === 'singles' ? 'Singles (1v1)' : 'Doubles (2v2)'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'grid', gap:6 }}>
                    <span style={{ fontSize:13, opacity:.85 }}>Advancement</span>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {([
                        { key:'points', label:'Points + wins' },
                        { key:'wins', label:'Winners only' },
                      ] as const).map(opt => (
                        <button
                          key={opt.key}
                          style={settings.groups?.advancement === opt.key ? btnActive : btnMini}
                          disabled={busy || t.status !== 'setup'}
                          onClick={() => update(x => {
                            if (x.status !== 'setup') return;
                            const current = normalizeSettings(x.settings);
                            const nextSettings = normalizeSettings({
                              ...x.settings,
                              format: 'groups',
                              groups: { ...(current.groups || {}), advancement: opt.key },
                            });
                            x.settings = nextSettings;
                          })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, opacity:.9 }}>
                      <input
                        type="checkbox"
                        checked={!!settings.groups?.losersNext}
                        disabled={busy || t.status !== 'setup'}
                        onChange={(e) => update(x => {
                          if (x.status !== 'setup') return;
                          const current = normalizeSettings(x.settings);
                          const nextSettings = normalizeSettings({
                            ...x.settings,
                            format: 'groups',
                            groups: { ...(current.groups || {}), losersNext: e.target.checked },
                          });
                          x.settings = nextSettings;
                        })}
                      />
                      Offer losers’ consolation round
                    </label>
                  </div>
                </div>
              )}
            </div>

            {settings.format === 'groups' && (
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginTop:6 }}>
                <button
                  style={{ ...btnGhost, ...lock }}
                  disabled={busy || t.status === 'completed'}
                  onClick={randomizeGroupsFromPlayers}
                >
                  Shuffle & build groups from players
                </button>
                <span style={{ fontSize:12, opacity:.7 }}>
                  Randomizes everyone into balanced groups; drag teams between groups to fine-tune before play.
                </span>
              </div>
            )}

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

        {settings.format === 'groups' && t.groupStage?.groups && (
          <section style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}>
              <div>
                <h3 style={{ margin:'0 0 4px' }}>Groups / Pools</h3>
                <div style={{ opacity:.75, fontSize:13 }}>
                  {settings.groups?.matchType === 'doubles' ? 'Doubles (2v2)' : 'Singles (1v1)'} •
                  {' '}{settings.groups?.advancement === 'wins' ? 'Winners advance' : 'Points + wins advance'}
                  {settings.groups?.losersNext ? ' • Consolation enabled' : ''}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:12, opacity:.7 }}>Groups stay ordered (A, B, C…) and feed the bracket.</span>
                <button
                  style={btnGhost}
                  onClick={() => alert(
                    'Group Pools: players are placed into groups (default 4 per group). Each team plays everyone else in their group once. Wins are worth 3 points; losses are 0. Standings use points, game difference, then games won. Top seeds advance (A1 vs B2, B1 vs A2, etc.). You can add late arrivals into a specific group and rebuild the bracket from standings at any time.'
                  )}
                >How Group Pools work</button>
              </div>
            </div>
            <div style={{ display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', marginTop:10 }}>
              {t.groupStage.groups.map((group, idx) => {
                const ordered = rankedGroups[idx] || group;
                const matchesForGroup = (groupStage?.matches || []).filter((m) => m.group === idx);
                const onGroupDragStart = (ev: React.DragEvent, payload: GroupDragPayload) => {
                  if (!allowGroupDrag) return;
                  ev.dataTransfer.setData('application/json', JSON.stringify(payload));
                  ev.dataTransfer.effectAllowed = 'move';
                };
                const parseGroupDrag = (ev: React.DragEvent): GroupDragPayload | null => {
                  const raw = ev.dataTransfer.getData('application/json');
                  if (!raw) return null;
                  try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.type === 'group-seat') return parsed as GroupDragPayload;
                  } catch { return null; }
                  return null;
                };
                const onGroupDrop = (ev: React.DragEvent, toGroup: number) => {
                  if (!allowGroupDrag) return;
                  ev.preventDefault();
                  const parsed = parseGroupDrag(ev);
                  if (!parsed) return;
                  moveTeamBetweenGroups(parsed.teamId, parsed.from, toGroup);
                };
                const onGroupDragOver = (ev: React.DragEvent) => { if (allowGroupDrag) ev.preventDefault(); };
                return (
                  <div
                    key={idx}
                    style={{ background:'linear-gradient(135deg, #111827, #0b1020)', borderRadius:14, padding:12, border:'1px solid rgba(56,189,248,0.15)', boxShadow:'0 10px 25px rgba(0,0,0,0.25)', display:'grid', gap:10 }}
                    onDragOver={onGroupDragOver}
                    onDrop={(ev) => onGroupDrop(ev, idx)}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                      <div>
                        <div style={{ fontWeight:800, letterSpacing:0.5 }}>{groupLabel(idx)}</div>
                        <div style={{ fontSize:12, opacity:.7 }}>{group.length} team{group.length === 1 ? '' : 's'} • Round robin</div>
                      </div>
                      <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                        <span style={{ fontSize:12, opacity:.7 }}>{settings.groups?.advancement === 'wins' ? 'Winners advance' : 'Points advance'}</span>
                        {canHost && (
                          <button
                            style={btnMini}
                            onClick={() => {
                              const nm = prompt(`Add a player/team directly to ${groupLabel(idx)}?`);
                              if (!nm) return;
                              const p = { id: uid(), name: nm.trim() || 'Player' };
                              update((x) => addLateLocal(x, p, idx));
                            }}
                            disabled={busy}
                          >Add to {groupLabel(idx)}</button>
                        )}
                      </div>
                    </div>

                    {ordered.length === 0 ? (
                      <div style={{ opacity:.65, fontSize:13 }}>No teams yet.</div>
                    ) : (
                      <div style={{ display:'grid', gap:6 }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr repeat(5, auto)', gap:6, fontSize:12, opacity:.7 }}>
                          <span>Team</span><span>Pts</span><span>W</span><span>L</span><span>GD</span><span>GW</span>
                        </div>
                        {ordered.map((teamId, rankIdx) => {
                          const rec = groupStage?.records?.[teamId] || { points:0, wins:0, losses:0, played:0, gamesWon:0, gamesLost:0 };
                          const gd = (rec.gamesWon || 0) - (rec.gamesLost || 0);
                          const label = `${groupLabel(idx).split(' ')[1]}${rankIdx + 1}`;
                          return (
                            <div
                              key={teamId}
                              draggable={allowGroupDrag}
                              onDragStart={(ev) => onGroupDragStart(ev, { type:'group-seat', teamId, from: idx })}
                              style={{ display:'grid', gridTemplateColumns:'1fr repeat(5, auto)', gap:6, alignItems:'center', padding:'6px 8px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', cursor: allowGroupDrag ? 'grab' : 'default' }}
                            >
                              <div style={{ display:'flex', gap:6, alignItems:'center', minWidth:0 }}>
                                <span style={{ fontSize:11, opacity:.6 }}>{label}</span>
                                <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{teamName(teamId)}</span>
                              </div>
                              <span>{rec.points}</span>
                              <span>{rec.wins}</span>
                              <span>{rec.losses}</span>
                              <span>{gd}</span>
                              <span>{rec.gamesWon}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display:'grid', gap:6 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>Group matches</div>
                      {matchesForGroup.length === 0 ? (
                        <div style={{ opacity:.65, fontSize:13 }}>Matches will appear once at least two teams are in this group.</div>
                      ) : (
                        <div style={{ display:'grid', gap:6 }}>
                          {matchesForGroup.map((m, i) => {
                            const aScore = Number.isFinite(m.scoreA) ? Number(m.scoreA) : '';
                            const bScore = Number.isFinite(m.scoreB) ? Number(m.scoreB) : '';
                            const aName = teamName(m.a);
                            const bName = teamName(m.b);
                            return (
                              <div key={m.id} style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:6, alignItems:'center', padding:'8px 10px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                                <div style={{ display:'grid', gap:4 }}>
                                  <span style={{ fontWeight:600 }}>{aName}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={aScore}
                                    onChange={(e) => setGroupMatchScore(m.id, e.target.value === '' ? null : Number(e.target.value), Number.isFinite(m.scoreB) ? Number(m.scoreB) : null)}
                                    style={{ ...input, padding:'4px 6px' }}
                                    disabled={!canHost}
                                  />
                                </div>
                                <div style={{ display:'grid', gap:6, justifyItems:'center' }}>
                                  <span style={{ opacity:.7, fontSize:12 }}>vs</span>
                                    {canHost && (
                                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center' }}>
                                        <button style={btnMini} onClick={() => setGroupMatchScore(m.id, (Number.isFinite(m.scoreA) ? Number(m.scoreA) : 0) + 1, Number.isFinite(m.scoreB) ? Number(m.scoreB) : 0)} disabled={!canHost}>A +1</button>
                                        <button style={btnMini} onClick={() => setGroupMatchScore(m.id, Number.isFinite(m.scoreA) ? Number(m.scoreA) : 0, (Number.isFinite(m.scoreB) ? Number(m.scoreB) : 0) + 1)} disabled={!canHost}>B +1</button>
                                        <button style={btnMini} onClick={() => setGroupMatchScore(m.id, 0, 0)} disabled={!canHost}>Clear</button>
                                      </div>
                                    )}
                                  {m.winner && <span style={{ fontSize:11, opacity:.75 }}>Winner: {teamName(m.winner)}</span>}
                                </div>
                                <div style={{ display:'grid', gap:4 }}>
                                  <span style={{ fontWeight:600, textAlign:'right' }}>{bName}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={bScore}
                                    onChange={(e) => setGroupMatchScore(m.id, Number.isFinite(m.scoreA) ? Number(m.scoreA) : null, e.target.value === '' ? null : Number(e.target.value))}
                                    style={{ ...input, padding:'4px 6px' }}
                                    disabled={!canHost}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ opacity:.65, fontSize:12 }}>Each team plays every other team once. Enter games won for each side (e.g., 3-1).</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ opacity:.7, fontSize:12, marginTop:8 }}>Late arrivals can be slotted into any group; their remaining matches will appear above and flow into the elimination bracket when rebuilt.</div>
          </section>
        )}

        {/* Bracket */}
        {(t.rounds.length > 0 || settings.format === 'groups') && (
          <div style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>Bracket</h3>
              {settings.format === 'groups' && canHost && (
                <button style={btnMini} onClick={() => update(x => rebuildBracketFromGroups(x, normalizeSettings(x.settings)))} disabled={busy}>
                  Rebuild from group standings
                </button>
              )}
            </div>
            {settings.format === 'groups' && groupStage ? (
              <div style={{ display:'grid', gridTemplateColumns: `minmax(320px, 1fr) repeat(${Math.max(t.rounds.length, 1)}, minmax(260px, 1fr))`, gap:12, overflowX:'auto' }}>
                <div style={{ display:'grid', gap:10 }}>
                  <div style={{ opacity:.8, fontSize:13 }}>Group Stage</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {rankedGroups.map((group, idx) => (
                      <div key={idx} style={{ background:'linear-gradient(135deg, #3b0d45, #14061a)', borderRadius:16, padding:12, border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 12px 24px rgba(0,0,0,0.3)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                          <div style={{ fontWeight:900, letterSpacing:0.5 }}>{groupLabel(idx)}</div>
                          <span style={{ fontSize:12, opacity:.7 }}>{settings.groups?.advancement === 'wins' ? 'Wins advance' : 'Points advance'}</span>
                        </div>
                        {group.length === 0 ? (
                          <div style={{ opacity:.7, fontSize:12 }}>No teams yet.</div>
                        ) : (
                          <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
                            {group.map((teamId, rankIdx) => {
                              const rec = groupStage.records[teamId] || { points:0, wins:0, losses:0, played:0, gamesWon:0, gamesLost:0 };
                              const gd = (rec.gamesWon || 0) - (rec.gamesLost || 0);
                              return (
                                <li key={teamId} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'8px 10px', display:'grid', gap:6 }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:6 }}>
                                    <div style={{ fontWeight:700 }}>{teamName(teamId)}</div>
                                    <span style={{ fontSize:11, opacity:.65 }}>#{rankIdx + 1}</span>
                                  </div>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:6 }}>
                                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                                      <span style={statPill}>Pts {rec.points}</span>
                                      <span style={statPill}>W {rec.wins}</span>
                                      <span style={statPill}>L {rec.losses}</span>
                                      <span style={statPill}>GD {gd}</span>
                                    </div>
                                      {canHost && (
                                        <div style={{ display:'flex', gap:4, flexWrap:'wrap', justifyContent:'flex-end' }}>
                                          <button style={btnMini} onClick={() => adjustGroupRecord(teamId, 'points', 1)} disabled={!canHost}>+1 pt</button>
                                          <button style={btnMini} onClick={() => adjustGroupRecord(teamId, 'wins', 1)} disabled={!canHost}>+1 win</button>
                                          <button style={btnMini} onClick={() => adjustGroupRecord(teamId, 'losses', 1)} disabled={!canHost}>+1 loss</button>
                                        </div>
                                      )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {t.rounds.length === 0 ? (
                  <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:12 }}>
                    <div style={{ fontWeight:700, marginBottom:6 }}>Waiting for group results</div>
                    <div style={{ fontSize:12, opacity:.75 }}>
                      Enter scores for every group match. Once all matches have a winner, the knockout bracket will seed automatically (A1 vs B2, B1 vs A2, etc.).
                    </div>
                  </div>
                ) : t.rounds.map((round, rIdx) => (
                  <div key={rIdx} style={{ display: 'grid', gap: 8 }}>
                    <div style={{ opacity: .8, fontSize: 13 }}>{roundName(rIdx, t.rounds.length)}</div>
                  {round.map((m, i) => {
                    const aName = teamName(m.a) || (m.a ? '??' : 'BYE');
                    const bName = teamName(m.b) || (m.b ? '??' : 'BYE');
                    const w = m.winner;
                    const iPlay = me && (teamHasPlayer(m.a, me?.id) || teamHasPlayer(m.b, me?.id));
                    const canReport = !canHost && iPlay && !w && t.status === 'active';
                    const matchShellB: React.CSSProperties = {
                      background: 'linear-gradient(135deg, #0f172a, #0b1223)',
                      borderRadius: 12,
                      padding: '12px',
                      display: 'grid',
                      gap: 8,
                      border: w ? '1px solid rgba(34,197,94,0.55)' : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: w ? '0 10px 20px rgba(34,197,94,0.25)' : '0 10px 18px rgba(0,0,0,0.25)',
                    };
                    const advanceNoteB = rIdx === t.rounds.length - 1 ? 'Winner takes the title' : 'Winner advances to the next round';
                      const matchShellA: React.CSSProperties = {
                        background: 'linear-gradient(135deg, #0f172a, #0b1223)',
                        borderRadius: 12,
                        padding: '12px',
                        display: 'grid',
                        gap: 8,
                        border: w ? '1px solid rgba(34,197,94,0.55)' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: w ? '0 10px 20px rgba(34,197,94,0.25)' : '0 10px 18px rgba(0,0,0,0.25)',
                      };
                      const advanceNoteA = rIdx === t.rounds.length - 1 ? 'Winner takes the title' : 'Winner advances to the next round';

                      type DragInfo = { type: 'seat'; round: number; match: number; side: 'a' | 'b'; teamId?: string };
                      const allowDrag = canHost && t.status !== 'completed';
                      function onDragStart(ev: React.DragEvent, info: DragInfo) {
                        if (!allowDrag) return;
                        ev.dataTransfer.setData('application/json', JSON.stringify(info));
                        ev.dataTransfer.effectAllowed = 'move';
                      }
                      function onDragOver(ev: React.DragEvent) {
                        if (!allowDrag) return;
                        ev.preventDefault();
                      }
                      function parseDrag(ev: React.DragEvent): DragInfo | null {
                        const raw = ev.dataTransfer.getData('application/json');
                        if (!raw) return null;
                        try {
                          const parsed = JSON.parse(raw);
                          if (parsed?.type === 'seat') return parsed as DragInfo;
                        } catch {
                          return null;
                        }
                        return null;
                      }
                      function swapSeats(src: DragInfo, target: DragInfo) {
                        update((x) => {
                          const mSrc = x.rounds?.[src.round]?.[src.match];
                          const mTgt = x.rounds?.[target.round]?.[target.match];
                          if (!mSrc || !mTgt) return;

                          const clear = (mm: Match) => { mm.winner = undefined; mm.reports = {}; };
                          clear(mSrc); clear(mTgt);

                          const valSrc = (mSrc as any)[src.side] as string | undefined;
                          const valTgt = (mTgt as any)[target.side] as string | undefined;
                          (mSrc as any)[src.side] = valTgt;
                          (mTgt as any)[target.side] = valSrc;

                          clearRoundsFrom(x, Math.min(src.round, target.round));
                          buildNextRoundFromSync(x, 0);
                        });
                      }
                      function onDrop(ev: React.DragEvent, target: DragInfo) {
                        if (!allowDrag) return;
                        ev.preventDefault();
                        const src = parseDrag(ev);
                        if (!src) return;
                        swapSeats(src, target);
                      }
                      function onDropIntoMatch(ev: React.DragEvent, roundIdx: number, matchIdx: number) {
                        if (!allowDrag) return;
                        ev.preventDefault();
                        const src = parseDrag(ev);
                        if (!src) return;

                        const m = t.rounds?.[roundIdx]?.[matchIdx];
                        if (!m) return;
                        const side: 'a' | 'b' = !m.a ? 'a' : !m.b ? 'b' : 'a';
                        swapSeats(src, { type: 'seat', round: roundIdx, match: matchIdx, side });
                      }
                      function pill(teamId?: string, round?: number, match?: number, side?: 'a' | 'b') {
                        const name = teamName(teamId);
                        const label = seedLabels.get(teamId || '');
                        const display = label ? `${name} (${label})` : name;
                        const info: DragInfo = { type: 'seat', round: round!, match: match!, side: side!, teamId };
                        return (
                          <span
                            draggable={allowDrag}
                            onDragStart={e => onDragStart(e, info)}
                            onDragOver={onDragOver}
                            onDrop={e => onDrop(e, info)}
                            style={{ ...pillStyle, opacity: teamId ? 1 : .6, cursor: allowDrag ? 'grab' : 'default' }}
                            title={allowDrag ? 'Drag to move this team' : undefined}
                          >
                            {display}
                          </span>
                        );
                      }

                      return (
                        <div
                          key={i}
                          style={matchShellA}
                          onDragOver={onDragOver}
                          onDrop={(ev) => onDropIntoMatch(ev, rIdx, i)}
                        >
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                            {pill(m.a, rIdx, i, 'a')}
                            <span style={{ opacity:.7 }}>vs</span>
                            {pill(m.b, rIdx, i, 'b')}
                          </div>

                            {canHost && t.status !== 'completed' && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems:'center' }}>
                                <button style={w === m.a ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.a)}>A wins</button>
                                <button style={w === m.b ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.b)}>B wins</button>
                                <button style={btnMini} onClick={() => hostSetWinner(rIdx, i, undefined)}>Clear</button>

                              <button
                                style={btnPing}
                                  onClick={() => update(x => { (x as any).lastPingAt = Date.now(); (x as any).lastPingR = rIdx; (x as any).lastPingM = i; }, { blockUI: false })}
                                  title={`Ping ${aName}`}
                                >Ping A 🔔</button>
                              <button
                                style={btnPing}
                                  onClick={() => update(x => { (x as any).lastPingAt = Date.now(); (x as any).lastPingR = rIdx; (x as any).lastPingM = i; }, { blockUI: false })}
                                  title={`Ping ${bName}`}
                                >Ping B 🔔</button>

                              {w && <span style={{ fontSize: 12, opacity: .8 }}>Winner: {teamName(w)}</span>}
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
                              Winner: {teamName(w)}
                            </div>
                          )}
                          <div style={{ fontSize:12, opacity:.65 }}>{advanceNoteA}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.rounds.length}, minmax(260px, 1fr))`, gap: 12, overflowX: 'auto' }}>
                {t.rounds.map((round, rIdx) => (
                  <div key={rIdx} style={{ display: 'grid', gap: 8 }}>
                    <div style={{ opacity: .8, fontSize: 13 }}>{roundName(rIdx, t.rounds.length)}</div>
                    {round.map((m, i) => {
                      const aName = teamName(m.a) || (m.a ? '??' : 'BYE');
                      const bName = teamName(m.b) || (m.b ? '??' : 'BYE');
                      const w = m.winner;
                      const iPlay = me && (teamHasPlayer(m.a, me?.id) || teamHasPlayer(m.b, me?.id));
                      const canReport = !canHost && iPlay && !w && t.status === 'active';

                      type DragInfo = { type: 'seat'; round: number; match: number; side: 'a' | 'b'; teamId?: string };
                      const allowDrag = canHost && t.status !== 'completed';
                      function onDragStart(ev: React.DragEvent, info: DragInfo) {
                        if (!allowDrag) return;
                        ev.dataTransfer.setData('application/json', JSON.stringify(info));
                        ev.dataTransfer.effectAllowed = 'move';
                      }
                      function onDragOver(ev: React.DragEvent) {
                        if (!allowDrag) return;
                        ev.preventDefault();
                      }
                      function parseDrag(ev: React.DragEvent): DragInfo | null {
                        const raw = ev.dataTransfer.getData('application/json');
                        if (!raw) return null;
                        try {
                          const parsed = JSON.parse(raw);
                          if (parsed?.type === 'seat') return parsed as DragInfo;
                        } catch {
                          return null;
                        }
                        return null;
                      }
                      function swapSeats(src: DragInfo, target: DragInfo) {
                        update((x) => {
                          const mSrc = x.rounds?.[src.round]?.[src.match];
                          const mTgt = x.rounds?.[target.round]?.[target.match];
                          if (!mSrc || !mTgt) return;

                          const clear = (mm: Match) => { mm.winner = undefined; mm.reports = {}; };
                          clear(mSrc); clear(mTgt);

                          const valSrc = (mSrc as any)[src.side] as string | undefined;
                          const valTgt = (mTgt as any)[target.side] as string | undefined;
                          (mSrc as any)[src.side] = valTgt;
                          (mTgt as any)[target.side] = valSrc;

                          clearRoundsFrom(x, Math.min(src.round, target.round));
                          buildNextRoundFromSync(x, 0);
                        });
                      }
                      function onDrop(ev: React.DragEvent, target: DragInfo) {
                        if (!allowDrag) return;
                        ev.preventDefault();
                        const src = parseDrag(ev);
                        if (!src) return;
                        swapSeats(src, target);
                      }
                      function onDropIntoMatch(ev: React.DragEvent, roundIdx: number, matchIdx: number) {
                        if (!allowDrag) return;
                        ev.preventDefault();
                        const src = parseDrag(ev);
                        if (!src) return;

                        const m = t.rounds?.[roundIdx]?.[matchIdx];
                        if (!m) return;
                        const side: 'a' | 'b' = !m.a ? 'a' : !m.b ? 'b' : 'a';
                        swapSeats(src, { type: 'seat', round: roundIdx, match: matchIdx, side });
                      }
                      function pill(teamId?: string, round?: number, match?: number, side?: 'a' | 'b') {
                        const name = teamName(teamId);
                        const label = seedLabels.get(teamId || '');
                        const display = label ? `${name} (${label})` : name;
                        const info: DragInfo = { type: 'seat', round: round!, match: match!, side: side!, teamId };
                        return (
                          <span
                            draggable={allowDrag}
                            onDragStart={e => onDragStart(e, info)}
                            onDragOver={onDragOver}
                            onDrop={e => onDrop(e, info)}
                            style={{ ...pillStyle, opacity: teamId ? 1 : .6, cursor: allowDrag ? 'grab' : 'default' }}
                            title={allowDrag ? 'Drag to move this team' : undefined}
                          >
                            {display}
                          </span>
                        );
                      }

                      return (
                      <div
                        key={i}
                        style={matchShellB}
                        onDragOver={onDragOver}
                        onDrop={(ev) => onDropIntoMatch(ev, rIdx, i)}
                      >
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                            {pill(m.a, rIdx, i, 'a')}
                            <span style={{ opacity:.7 }}>vs</span>
                            {pill(m.b, rIdx, i, 'b')}
                          </div>

                            {canHost && t.status !== 'completed' && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems:'center' }}>
                                <button style={w === m.a ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.a)}>A wins</button>
                                <button style={w === m.b ? btnActive : btnMini} onClick={() => hostSetWinner(rIdx, i, m.b)}>B wins</button>
                                <button style={btnMini} onClick={() => hostSetWinner(rIdx, i, undefined)}>Clear</button>

                              <button
                                style={btnPing}
                                  onClick={() => update(x => { (x as any).lastPingAt = Date.now(); (x as any).lastPingR = rIdx; (x as any).lastPingM = i; }, { blockUI: false })}
                                  title={`Ping ${aName}`}
                                >Ping A 🔔</button>
                              <button
                                style={btnPing}
                                  onClick={() => update(x => { (x as any).lastPingAt = Date.now(); (x as any).lastPingR = rIdx; (x as any).lastPingM = i; }, { blockUI: false })}
                                  title={`Ping ${bName}`}
                                >Ping B 🔔</button>

                              {w && <span style={{ fontSize: 12, opacity: .8 }}>Winner: {teamName(w)}</span>}
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
                            Winner: {teamName(w)}
                          </div>
                        )}
                        <div style={{ fontSize:12, opacity:.65 }}>{advanceNoteB}</div>
                      </div>
                    );
                  })}
                  </div>
                ))}
              </div>
            )}
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
const statPill: React.CSSProperties = { padding:'4px 8px', borderRadius: 999, background:'rgba(255,255,255,0.08)', fontSize: 12 };
