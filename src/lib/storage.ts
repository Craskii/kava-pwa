// src/lib/storage.ts
/* ---------------- Types ---------------- */

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
  code?: string;                 // short join code (must be unique server-side)
  hostId: string;
  status: TournamentStatus;      // 'setup' until host starts
  createdAt: number;

  // roster
  players: Player[];             // approved players
  pending: Player[];             // awaiting host approval

  // optional queue you already use on the pages
  queue: string[];

  // rounds[r][m] -> Match   (0 = first round)
  rounds: Match[][];
};

export const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- Local (existing) ---------------- */

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

/* ---------------- Remote (Cloudflare Functions) ----------------
   Uses the /functions/api/... endpoints we added:
   - /api/tournaments (GET list, POST create)
   - /api/tournaments/[id] (GET/PUT/DELETE one)
   - /api/by-code/[code] (GET resolve, HEAD check)
------------------------------------------------------------------ */

const API_BASE = ""; // relative to the site origin

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${txt}`);
  }
  return (await res.json()) as T;
}

/** GET a tournament by id from KV (multi-device). */
export async function getTournamentRemote(id: string): Promise<Tournament | null> {
  try {
    return await apiJson<Tournament>(`/api/tournaments/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

/** PUT full tournament to KV (enforces code ownership). */
export async function saveTournamentRemote(t: Tournament): Promise<void> {
  await apiJson(`/api/tournaments/${encodeURIComponent(t.id)}`, {
    method: "PUT",
    body: JSON.stringify(t),
  });
}

/** POST create new tournament (fails if code is in use). */
export async function createTournamentRemote(t: Tournament): Promise<{ id: string }> {
  return await apiJson<{ id: string }>(`/api/tournaments`, {
    method: "POST",
    body: JSON.stringify(t),
  });
}

/** DELETE tournament and free its code. */
export async function deleteTournamentRemote(id: string): Promise<void> {
  await apiJson(`/api/tournaments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** GET tournament by short code (404 if not found). */
export async function findByCodeRemote(code: string): Promise<Tournament | null> {
  try {
    return await apiJson<Tournament>(`/api/by-code/${encodeURIComponent(code.trim().toLowerCase())}`);
  } catch {
    return null;
  }
}

/** HEAD to see if a code is already in use (true = taken). */
export async function isCodeInUseRemote(code: string): Promise<boolean> {
  const res = await fetch(`/api/by-code/${encodeURIComponent(code.trim().toLowerCase())}`, { method: "HEAD" });
  // We defined HEAD to return 200 if exists, 404 if free
  return res.status === 200;
}

/* ---------------- Bracket helpers (unchanged) ---------------- */

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

/** Host presses Start (randomize + pad to power of 2 with BYEs). */
export function seedInitialRounds(t: Tournament) {
  const ids = shuffle(t.players.map(p => p.id));
  const size = nextPowerOf2(ids.length);
  const padded = [...ids, ...Array(Math.max(0, size - ids.length)).fill(undefined)];
  const firstRound: Match[] = [];
  for (let i = 0; i < size; i += 2) {
    firstRound.push({ a: padded[i], b: padded[i + 1], reports: {} });
  }
  t.rounds = [firstRound];
  t.status = "active";
  saveTournament(t); // local save for offline; use saveTournamentRemote() when online
}

/** Insert a late player during an active tournament. Prefer filling a BYE seat. */
export function insertLatePlayer(t: Tournament, p: Player) {
  if (!t.players.some(x => x.id === p.id)) t.players.push(p);

  const r0 = t.rounds[0] || [];
  for (const m of r0) {
    if (!m.a) { m.a = p.id; m.reports ??= {}; saveTournament(t); return; }
    if (!m.b) { m.b = p.id; m.reports ??= {}; saveTournament(t); return; }
  }
  r0.push({ a: p.id, b: undefined, reports: {} });
  t.rounds[0] = r0;
  saveTournament(t);
}

/** Recompute the next round from winners when a round completes. */
function buildNextRoundFrom(t: Tournament, roundIndex: number) {
  const cur = t.rounds[roundIndex];
  const winners: (string | undefined)[] = cur.map(m => m.winner);
  if (winners.some(w => w === undefined)) return;

  // final done?
  if (winners.length === 1 && winners[0]) {
    t.status = "completed";
    saveTournament(t);
    return;
  }

  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    next.push({ a: winners[i], b: winners[i + 1], reports: {} });
  }
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next;
  else t.rounds.push(next);
  saveTournament(t);
}

/** Player reports "win" or "loss"; advance when consistent (or BYE). */
export function submitReport(t: Tournament, roundIndex: number, matchIndex: number, playerId: string, result: "win" | "loss") {
  const m = t.rounds?.[roundIndex]?.[matchIndex];
  if (!m) return;

  m.reports ??= {};
  m.reports[playerId] = result;

  if (m.a && !m.b) { m.winner = m.a; saveTournament(t); buildNextRoundFrom(t, roundIndex); return; }
  if (!m.a && m.b) { m.winner = m.b; saveTournament(t); buildNextRoundFrom(t, roundIndex); return; }

  if (m.a && m.b) {
    const ra = m.reports[m.a];
    const rb = m.reports[m.b];
    if (ra && rb) {
      if (ra === "win" && rb === "loss") m.winner = m.a;
      else if (ra === "loss" && rb === "win") m.winner = m.b;
      if (m.winner) { saveTournament(t); buildNextRoundFrom(t, roundIndex); return; }
    }
  }
  saveTournament(t);
}

/* ---------------- Approvals ---------------- */

export function approvePending(t: Tournament, playerId: string) {
  const idx = t.pending.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  const p = t.pending[idx];
  t.pending.splice(idx, 1);

  if (t.status === "active") {
    insertLatePlayer(t, p);
  } else {
    t.players.push(p);
    saveTournament(t);
  }
}

export function declinePending(t: Tournament, playerId: string) {
  t.pending = t.pending.filter(p => p.id !== playerId);
  saveTournament(t);
}
