// src/lib/storage.ts
export type Player = { id: string; name: string };

export type Report = "win" | "loss" | undefined;

export type Match = {
  a?: string;              // playerId
  b?: string;              // playerId
  winner?: string;         // playerId
  // per-player self report
  reports?: { [playerId: string]: Report };
};

export type TournamentStatus = "setup" | "active" | "completed";

export type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: TournamentStatus;      // 'setup' until host starts
  createdAt: number;

  // roster
  players: Player[];             // approved players
  pending: Player[];             // awaiting host approval

  // queue is optional here; you can still keep it if you like
  queue: string[];

  // rounds[r][m] -> Match   (0 = first round)
  rounds: Match[][];
};

const KEY = "kava_tournaments_v2";

function readAll(): Record<string, Tournament> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function writeAll(all: Record<string, Tournament>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function listTournaments(): Tournament[] {
  return Object.values(readAll());
}
export function getTournament(id: string): Tournament | null {
  return readAll()[id] || null;
}
export function saveTournament(t: Tournament) {
  const all = readAll(); all[t.id] = t; writeAll(all);
}
export function deleteTournament(id: string) {
  const all = readAll(); delete all[id]; writeAll(all);
}
export function findByCode(code: string): Tournament | null {
  return listTournaments().find(t => (t.code || "") === code) || null;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- Bracket helpers ---------------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextPowerOf2(n: number) {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
}

export function seedInitialRounds(t: Tournament) {
  // randomize approved players
  const ids = shuffle(t.players.map(p => p.id));
  const size = nextPowerOf2(ids.length);
  const padded = [...ids, ...Array(Math.max(0, size - ids.length)).fill(undefined)];
  const firstRound: Match[] = [];
  for (let i = 0; i < size; i += 2) {
    firstRound.push({ a: padded[i], b: padded[i + 1], reports: {} });
  }
  t.rounds = [firstRound];
  t.status = "active";
  saveTournament(t);
}

/** Insert a late player during an active tournament. Prefer filling a BYE seat. */
export function insertLatePlayer(t: Tournament, p: Player) {
  // add to roster
  if (!t.players.some(x => x.id === p.id)) t.players.push(p);

  // try to fill any BYE (undefined seat) in the *current* first round
  const r0 = t.rounds[0] || [];
  for (const m of r0) {
    if (!m.a) { m.a = p.id; m.reports ??= {}; saveTournament(t); return; }
    if (!m.b) { m.b = p.id; m.reports ??= {}; saveTournament(t); return; }
  }
  // else, create a play-in match at bottom
  r0.push({ a: p.id, b: undefined, reports: {} });
  t.rounds[0] = r0;
  saveTournament(t);
}

/** Recompute the next round from winners when a round completes. */
function buildNextRoundFrom(t: Tournament, roundIndex: number) {
  const cur = t.rounds[roundIndex];
  const winners: (string | undefined)[] = cur.map(m => m.winner);
  if (winners.some(w => w === undefined)) return; // not ready yet

  // final done?
  if (winners.length === 1 && winners[0]) {
    t.status = "completed";
    saveTournament(t);
    return;
  }

  // pair winners for next round
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    next.push({ a: winners[i], b: winners[i + 1], reports: {} });
  }
  // append or replace next round
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next;
  else t.rounds.push(next);
  saveTournament(t);
}

/** A player reports "win" or "loss" for a match; advance when consistent. */
export function submitReport(t: Tournament, roundIndex: number, matchIndex: number, playerId: string, result: "win" | "loss") {
  const m = t.rounds?.[roundIndex]?.[matchIndex];
  if (!m) return;

  m.reports ??= {};
  m.reports[playerId] = result;

  // auto-handle BYEs: if only one player exists, they win
  if (m.a && !m.b) { m.winner = m.a; saveTournament(t); buildNextRoundFrom(t, roundIndex); return; }
  if (!m.a && m.b) { m.winner = m.b; saveTournament(t); buildNextRoundFrom(t, roundIndex); return; }

  // both present — check if we can resolve
  if (m.a && m.b) {
    const ra = m.reports[m.a];
    const rb = m.reports[m.b];
    // If both reported and consistent, decide winner
    if (ra && rb) {
      if (ra === "win" && rb === "loss") m.winner = m.a;
      else if (ra === "loss" && rb === "win") m.winner = m.b;
      // If they both said "win" or both "loss", ignore for now (host can override later if desired)
      if (m.winner) {
        saveTournament(t);
        buildNextRoundFrom(t, roundIndex);
        return;
      }
    }
  }
  saveTournament(t);
}

/* ---------------- High-level actions ---------------- */

export function approvePending(t: Tournament, playerId: string) {
  const idx = t.pending.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  const p = t.pending[idx];
  t.pending.splice(idx, 1);

  if (t.status === "active") {
    // Insert late into current bracket
    insertLatePlayer(t, p);
  } else {
    // Not started yet — just add to players
    t.players.push(p);
    saveTournament(t);
  }
}

export function declinePending(t: Tournament, playerId: string) {
  t.pending = t.pending.filter(p => p.id !== playerId);
  saveTournament(t);
}
