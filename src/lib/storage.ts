// src/lib/storage.ts

export type Player = { id: string; name: string };
export type Report = "win" | "loss" | undefined;

/* ===== Tournaments ===== */
export type TournamentFormat = "singles" | "doubles" | "groups" | "single_elim";
export type TournamentSettings = {
  format: TournamentFormat;
  teamSize: number;
  bracketStyle: "single_elim";
  groups?: {
    count: number;
    size: number;
    matchType?: "singles" | "doubles";
    advancement?: "points" | "wins";
    losersNext?: boolean;
  };
};
export type Team = { id: string; name: string; memberIds: string[] };
export type Match = {
  a?: string; // teamId
  b?: string; // teamId
  winner?: string; // teamId
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
  rounds: Match[][];
  v?: number;
  coHosts?: string[]; // <-- NEW: can ping & manage players/seeding
  teams?: Team[];
  settings?: TournamentSettings;
  groupStage?: { groups: string[][] };
};

/* ===== Lists ===== */
export type Table = { a?: string; b?: string };
export type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];
  v?: number; // server ETag/version (optional)
};

export const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- tiny fetch helper ---------- */
async function api<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let txt = "";
    try {
      txt = await res.text();
    } catch {}
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const data =
    (res.status === 204
      ? (undefined as unknown as T)
      : await res.json()) as T;
  return { data, headers: res.headers };
}

/* =======================
   TOURNAMENT — CRUD
======================= */
export async function getTournamentRemote(
  id: string
): Promise<Tournament | null> {
  try {
    const { data, headers } = await api<Tournament>(
      `/api/tournament/${encodeURIComponent(id)}`
    );
    const v = Number(headers.get("x-t-version") || "0");
    return { ...data, v: Number.isFinite(v) ? v : data.v ?? 0 };
  } catch {
    return null;
  }
}
export async function saveTournamentRemote(t: Tournament): Promise<Tournament> {
  const { headers } = await api<void>(
    `/api/tournament/${encodeURIComponent(t.id)}`,
    {
      method: "PUT",
      headers: { "if-match": String(t.v ?? 0) },
      body: JSON.stringify(t),
    }
  );
  const newV = Number(headers.get("x-t-version") || "0");
  return { ...t, v: Number.isFinite(newV) ? newV : (t.v ?? 0) + 1 };
}
export async function deleteTournamentRemote(id: string): Promise<void> {
  await api<void>(`/api/tournament/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
export async function listTournamentsRemoteForUser(userId: string): Promise<{
  hosting: Tournament[];
  playing: Tournament[];
}> {
  const { data } = await api<{ hosting: Tournament[]; playing: Tournament[] }>(
    `/api/tournaments?userId=${encodeURIComponent(userId)}`
  );
  return {
    hosting: data.hosting.map((t) => ({ ...t, v: Number(t.v ?? 0) })),
    playing: data.playing.map((t) => ({ ...t, v: Number(t.v ?? 0) })),
  };
}

/* ---------- Tournament helpers ---------- */
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
  const ids = shuffle(t.players.map((p) => p.id));
  const size = nextPowerOf2(ids.length);
  const padded = [
    ...ids,
    ...Array(Math.max(0, size - ids.length)).fill(undefined),
  ];
  const firstRound: Match[] = [];
  for (let i = 0; i < size; i += 2)
    firstRound.push({ a: padded[i], b: padded[i + 1], reports: {} });
  const next: Tournament = { ...t, rounds: [firstRound], status: "active" };
  const saved = await saveTournamentRemote(next);
  Object.assign(t, saved);
}

export async function insertLatePlayer(t: Tournament, p: Player) {
  const copy: Tournament = {
    ...t,
    players: [...t.players],
    rounds: t.rounds.map((r) =>
      r.map((m) => ({ ...m, reports: { ...(m.reports || {}) } }))
    ),
  };
  if (!copy.players.some((x) => x.id === p.id)) copy.players.push(p);
  const r0 = copy.rounds[0] || [];
  for (const m of r0) {
    if (!m.a) {
      m.a = p.id;
      m.reports ??= {};
      const saved = await saveTournamentRemote(copy);
      Object.assign(t, saved);
      return;
    }
    if (!m.b) {
      m.b = p.id;
      m.reports ??= {};
      const saved = await saveTournamentRemote(copy);
      Object.assign(t, saved);
      return;
    }
  }
  r0.push({ a: p.id, b: undefined, reports: {} });
  copy.rounds[0] = r0;
  const saved = await saveTournamentRemote(copy);
  Object.assign(t, saved);
}

function buildNextRoundFromSync(t: Tournament, roundIndex: number) {
  const cur = t.rounds[roundIndex];
  const winners = cur.map((m) => m.winner);
  if (winners.some((w) => !w)) return;
  if (winners.length === 1 && winners[0]) {
    t.status = "completed";
    return;
  }
  const next: Match[] = [];
  for (let i = 0; i < winners.length; i += 2)
    next.push({ a: winners[i], b: winners[i + 1], reports: {} });
  if (t.rounds[roundIndex + 1]) t.rounds[roundIndex + 1] = next;
  else t.rounds.push(next);
}

export async function submitReport(
  t: Tournament,
  roundIndex: number,
  matchIndex: number,
  playerId: string,
  result: "win" | "loss"
) {
  const copy: Tournament = {
    ...t,
    rounds: t.rounds.map((r) =>
      r.map((m) => ({ ...m, reports: { ...(m.reports || {}) } }))
    ),
    players: [...t.players],
    pending: [...t.pending],
  };
  const m = copy.rounds?.[roundIndex]?.[matchIndex];
  if (!m) return;
  m.reports ??= {};
  m.reports[playerId] = result;
  if (m.a && !m.b) m.winner = m.a;
  if (!m.a && m.b) m.winner = m.b;
  if (m.a && m.b) {
    const ra = m.reports[m.a],
      rb = m.reports[m.b];
    if (ra && rb) {
      if (ra === "win" && rb === "loss") m.winner = m.a;
      else if (ra === "loss" && rb === "win") m.winner = m.b;
    }
  }
  buildNextRoundFromSync(copy, roundIndex);
  const saved = await saveTournamentRemote(copy);
  Object.assign(t, saved);
}

export async function approvePending(t: Tournament, playerId: string) {
  const copy: Tournament = {
    ...t,
    players: [...t.players],
    pending: [...t.pending],
    rounds: t.rounds.map((r) =>
      r.map((m) => ({ ...m, reports: { ...(m.reports || {}) } }))
    ),
  };
  const idx = copy.pending.findIndex((p) => p.id === playerId);
  if (idx < 0) return;
  const p = copy.pending[idx];
  copy.pending.splice(idx, 1);
  if (copy.status === "active") {
    const saved = await (async () => {
      await insertLatePlayer(copy, p);
      return copy;
    })();
    Object.assign(t, saved);
  } else {
    copy.players.push(p);
    const saved = await saveTournamentRemote(copy);
    Object.assign(t, saved);
  }
}
export async function declinePending(t: Tournament, playerId: string) {
  const copy: Tournament = {
    ...t,
    pending: t.pending.filter((p) => p.id !== playerId),
  };
  const saved = await saveTournamentRemote(copy);
  Object.assign(t, saved);
}

/* =======================
   LISTS — CRUD
======================= */

export async function getListRemote(id: string): Promise<ListGame | null> {
  try {
    const { data, headers } = await api<ListGame>(
      `/api/list/${encodeURIComponent(id)}`
    );
    const v = Number(headers.get("x-l-version") || "0");
    return { ...data, v: Number.isFinite(v) ? v : data.v ?? 0 };
  } catch {
    return null;
  }
}
export async function saveListRemote(g: ListGame): Promise<ListGame> {
  const { headers } = await api<void>(
    `/api/list/${encodeURIComponent(g.id)}`,
    {
      method: "PUT",
      headers: { "if-match": String(g.v ?? 0) },
      body: JSON.stringify(g),
    }
  );
  const newV = Number(headers.get("x-l-version") || "0");
  return { ...g, v: Number.isFinite(newV) ? newV : (g.v ?? 0) + 1 };
}
export async function deleteListRemote(id: string): Promise<void> {
  await api<void>(`/api/list/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ---------- Lists helpers ---------- */
function fillTablesSync(x: ListGame) {
  for (const t of x.tables) {
    if (!t.a && x.queue.length) t.a = x.queue.shift();
    if (!t.b && x.queue.length) t.b = x.queue.shift();
  }
}

export async function listSetTables(
  x: ListGame,
  count: 1 | 2
): Promise<ListGame> {
  const copy: ListGame = {
    ...x,
    tables: x.tables.map((tb) => ({ ...tb })),
    queue: [...x.queue],
    players: [...x.players],
  };
  if (count === 1) {
    const keep = copy.tables[0] || {};
    const drop = copy.tables.slice(1);
    for (const tb of drop) {
      if (tb.a) copy.queue.push(tb.a);
      if (tb.b) copy.queue.push(tb.b);
    }
    copy.tables = [keep];
  } else {
    copy.tables = [copy.tables[0] || {}, copy.tables[1] || {}];
  }
  fillTablesSync(copy);
  const saved = await saveListRemote(copy);
  Object.assign(x, saved);
  return saved;
}

export async function listJoin(x: ListGame, p: Player): Promise<ListGame> {
  const copy: ListGame = {
    ...x,
    tables: x.tables.map((tb) => ({ ...tb })),
    queue: [...x.queue],
    players: [...x.players],
  };
  if (!copy.players.find((pp) => pp.id === p.id))
    copy.players.push({ id: p.id, name: p.name });
  const alreadyQueued = copy.queue.includes(p.id);
  const alreadySeated = copy.tables.some(
    (tb) => tb.a === p.id || tb.b === p.id
  );
  if (!alreadyQueued && !alreadySeated) copy.queue.push(p.id);
  fillTablesSync(copy);
  const saved = await saveListRemote(copy);
  Object.assign(x, saved);
  return saved;
}

export async function listILost(
  x: ListGame,
  tableIndex: number,
  loserId: string
): Promise<ListGame> {
  const copy: ListGame = {
    ...x,
    tables: x.tables.map((tb) => ({ ...tb })),
    queue: [...x.queue],
    players: [...x.players],
  };
  const tb = copy.tables[tableIndex];
  if (!tb) return x;
  if (tb.a === loserId) tb.a = undefined;
  if (tb.b === loserId) tb.b = undefined;
  fillTablesSync(copy);
  const saved = await saveListRemote(copy);
  Object.assign(x, saved);
  return saved;
}

export async function listLeave(
  x: ListGame,
  playerId: string
): Promise<ListGame> {
  const copy: ListGame = {
    ...x,
    tables: x.tables.map((tb) => ({ ...tb })),
    queue: [...x.queue],
    players: [...x.players],
  };
  copy.queue = copy.queue.filter((id) => id !== playerId);
  for (const tb of copy.tables) {
    if (tb.a === playerId) tb.a = undefined;
    if (tb.b === playerId) tb.b = undefined;
  }
  copy.players = copy.players.filter((p) => p.id !== playerId);
  fillTablesSync(copy);
  const saved = await saveListRemote(copy);
  Object.assign(x, saved);
  return saved;
}

/* ---------- Lists index summary ---------- */
export async function listListsRemoteForUser(
  userId: string
): Promise<{ hosting: ListGame[]; playing: ListGame[] }> {
  const { data } = await api<{ hosting: ListGame[]; playing: ListGame[] }>(
    `/api/lists?userId=${encodeURIComponent(userId)}`
  );
  return {
    hosting: data.hosting.map((x) => ({ ...x, v: Number(x.v ?? 0) })),
    playing: data.playing.map((x) => ({ ...x, v: Number(x.v ?? 0) })),
  };
}
