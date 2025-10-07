// src/lib/storage.ts
/* ---------------- Types ---------------- */
export type Player = { id: string; name: string };
export type Report = "win" | "loss" | undefined;

export type Match = {
  a?: string;
  b?: string;
  winner?: string;
  reports?: { [playerId: string]: Report };
};

export type TournamentStatus = "setup" | "active" | "completed";

export type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: TournamentStatus;
  createdAt: number;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

export const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- Local helpers ---------------- */
const KEY = "kava_tournaments_v2";

function readAll(): Record<string, Tournament> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Tournament>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(all));
}

/* ---------------- Cloudflare API ---------------- */
const API_BASE = "";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return (await res.json()) as T;
}

/* ---------------- Combined Sync ---------------- */

export function listTournaments(): Tournament[] {
  return Object.values(readAll());
}

export function getTournament(id: string): Tournament | null {
  const local = readAll()[id];
  if (local) return local;

  // Try fetching from Cloudflare in background
  fetch(`/api/tournament/${id}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data) {
        const all = readAll();
        all[id] = data;
        writeAll(all);
      }
    })
    .catch(() => {});

  return null;
}

export async function saveTournament(t: Tournament) {
  // Save locally
  const all = readAll();
  all[t.id] = t;
  writeAll(all);

  // Sync to Cloudflare KV
  fetch("/api/tournament/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(t),
  }).catch(() => {});
}

export function deleteTournament(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

/* ---------------- Helpers ---------------- */
export async function findByCodeRemote(code: string): Promise<{ id: string } | null> {
  try {
    return await apiJson<{ id: string }>(`/api/by-code/${encodeURIComponent(code.trim())}`);
  } catch {
    return null;
  }
}

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

function buildNextRoundFrom(t: Tournament, roundIndex: number) {
  const cur = t.rounds[roundIndex];
  const winners = cur.map(m => m.winner);
  if (winners.some(w => !w)) return;

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

export function submitReport(
  t: Tournament,
  roundIndex: number,
  matchIndex: number,
  playerId: string,
  result: "win" | "loss"
) {
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

  if (t.status === "active") insertLatePlayer(t, p);
  else t.players.push(p);

  saveTournament(t);
}

export function declinePending(t: Tournament, playerId: string) {
  t.pending = t.pending.filter(p => p.id !== playerId);
  saveTournament(t);
}
