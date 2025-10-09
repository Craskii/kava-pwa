// src/lib/storage.ts (remote-only)

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
  createdAt: number;      // epoch ms
  updatedAt: number;      // epoch ms (drives versioning)
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

export const uid = () => Math.random().toString(36).slice(2, 9);

// ---- Remote helpers (Cloudflare API under /api/**) ----

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` – ${txt}` : ""}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function createTournamentRemote(payload: {
  name: string;
  hostId: string;
}): Promise<{ id: string; code: string; tournament: Tournament }> {
  return api(`/api/create`, { method: "POST", body: JSON.stringify(payload) });
}

export async function getTournamentRemote(id: string): Promise<Tournament | null> {
  try { return await api<Tournament>(`/api/tournament/${encodeURIComponent(id)}`); }
  catch { return null; }
}

export async function saveTournamentRemote(t: Tournament): Promise<void> {
  await api(`/api/tournament/${encodeURIComponent(t.id)}`, {
    method: "PUT",
    body: JSON.stringify(t),
  });
}

export async function deleteTournamentRemote(id: string): Promise<void> {
  await api(`/api/tournament/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function findByCodeRemote(code: string): Promise<string | null> {
  try {
    const r = await api<{ id: string }>(`/api/by-code/${encodeURIComponent(code)}`);
    return r.id || null;
  } catch {
    return null;
  }
}

export async function isCodeInUseRemote(code: string): Promise<boolean> {
  const res = await fetch(`/api/by-code/${encodeURIComponent(code)}`, { method: "HEAD", cache: "no-store" });
  return res.status === 200;
}

export async function listTournamentsRemoteForUser(userId: string): Promise<{
  hosting: Tournament[];
  playing: Tournament[];
  listVersion: number;
}> {
  return api(`/api/tournaments?userId=${encodeURIComponent(userId)}`);
}

// ---- Bracket helpers (call saveTournamentRemote after mutating) ----

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

export async function seedInitialRounds(t: Tournament) {
  const ids = shuffle(t.players.map(p => p.id));
  const size = nextPowerOf2(ids.length);
  const padded = [...ids, ...Array(Math.max(0, size - ids.length)).fill(undefined)];
  const firstRound: Match[] = [];
  for (let i = 0; i < size; i += 2) {
    firstRound.push({ a: padded[i], b: padded[i + 1], reports: {} });
  }
  t.rounds = [firstRound];
  t.status = "active";
  await saveTournamentRemote(t);
}

export async function insertLatePlayer(t: Tournament, p: Player) {
  if (!t.players.some(x => x.id === p.id)) t.players.push(p);
  const r0 = t.rounds[0] || [];
  for (const m of r0) {
    if (!m.a) { m.a = p.id; m.reports ??= {}; await saveTournamentRemote(t); return; }
    if (!m.b) { m.b = p.id; m.reports ??= {}; await saveTournamentRemote(t); return; }
  }
  r0.push({ a: p.id, b: undefined, reports: {} });
  t.rounds[0] = r0;
  await saveTournamentRemote(t);
}

function buildNextRoundFromSync(t: Tournament, roundIndex: number) {
  const cur = t.rounds[roundIndex];
  const winners = cur.map(m => m.winner);
  if (winners.some(w => !w)) return;
  if (winners.length === 1 && winners[0]) {
    t.status = "completed";
    return;
  }
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    next.push({ a: winners[i], b: winners[i + 1], reports: {} });
  }
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next;
  else t.rounds.push(next);
}

export async function submitReport(
  t: Tournament, roundIndex: number, matchIndex: number, playerId: string, result: "win" | "loss"
) {
  const m = t.rounds?.[roundIndex]?.[matchIndex];
  if (!m) return;
  m.reports ??= {};
  m.reports[playerId] = result;

  if (m.a && !m.b) m.winner = m.a;
  if (!m.a && m.b) m.winner = m.b;

  if (m.a && m.b) {
    const ra = m.reports[m.a], rb = m.reports[m.b];
    if (ra && rb) {
      if (ra === "win" && rb === "loss") m.winner = m.a;
      else if (ra === "loss" && rb === "win") m.winner = m.b;
    }
  }

  buildNextRoundFromSync(t, roundIndex);
  await saveTournamentRemote(t);
}

export async function approvePending(t: Tournament, playerId: string) {
  const idx = t.pending.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  const p = t.pending[idx];
  t.pending.splice(idx, 1);
  if (t.status === "active") await insertLatePlayer(t, p);
  else { t.players.push(p); await saveTournamentRemote(t); }
}

export async function declinePending(t: Tournament, playerId: string) {
  t.pending = t.pending.filter(p => p.id !== playerId);
  await saveTournamentRemote(t);
}
