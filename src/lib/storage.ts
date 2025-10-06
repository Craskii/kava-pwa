// simple localStorage "DB" for demo
export type Player = { id: string; name: string };
export type Match = { a?: string; b?: string; winner?: string };
export type Tournament = {
  id: string;
  name: string;
  code?: string;         // 4-digit join code if private
  hostId: string;        // creator
  players: Player[];     // all joined players
  queue: string[];       // array of player ids in order
  matches: Match[];      // simple single-elim bracket
};

const KEY = "kava_tournaments_v1";

function readAll(): Record<string, Tournament> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function writeAll(all: Record<string, Tournament>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getTournament(id: string): Tournament | null {
  return readAll()[id] || null;
}
export function listTournaments(): Tournament[] {
  return Object.values(readAll());
}
export function saveTournament(t: Tournament) {
  const all = readAll(); all[t.id] = t; writeAll(all);
}
export function findByCode(code: string): Tournament | null {
  return listTournaments().find(t => (t.code || "") === code) || null;
}

// helpers
export const uid = () => Math.random().toString(36).slice(2, 9);
export function seedBracket(t: Tournament) {
  // single-elim: next power of 2
  const ids = t.players.map(p => p.id);
  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, ids.length))));
  const padded = [...ids, ...Array(Math.max(0, size - ids.length)).fill(undefined)];
  const matches: Match[] = [];
  for (let i = 0; i < size; i += 2) matches.push({ a: padded[i], b: padded[i + 1] });
  t.matches = matches;
  saveTournament(t);
}
export function removePlayer(t: Tournament, playerId: string) {
  t.players = t.players.filter(p => p.id !== playerId);
  t.queue = t.queue.filter(id => id !== playerId);
  // also clear from bracket seats
  t.matches = (t.matches || []).map(m => ({
    ...m,
    a: m.a === playerId ? undefined : m.a,
    b: m.b === playerId ? undefined : m.b,
    winner: m.winner === playerId ? undefined : m.winner
  }));
  saveTournament(t);
}
