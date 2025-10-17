// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { sendPushToPlayers } from "@/lib/push";

/* ---------- KV ---------- */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* ---------- Types ---------- */
type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type TournamentStatus = "setup" | "active" | "completed";
type Tournament = {
  id: string; name: string; code?: string; hostId: string; status: TournamentStatus;
  createdAt: number; players: Player[]; pending: Player[]; queue: string[]; rounds: Match[][];
  v?: number;
  // optional meta used for ping
  lastPingAt?: number; lastPingR?: number; lastPingM?: number;
  coHosts?: string[];
};

/* ---------- keys ---------- */
const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;
const PIDX = (playerId: string) => `tidx:p:${playerId}`; // string[]

async function getV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(TVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(TVER(id), String(v));
}

/* small helpers for indices */
async function readArr(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
async function writeArr(env: Env, key: string, arr: string[]) {
  await env.KAVA_TOURNAMENTS.put(key, JSON.stringify(arr));
}
async function addTo(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  if (!arr.includes(id)) { arr.push(id); await writeArr(env, key, arr); }
}
async function removeFrom(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  const next = arr.filter(x => x !== id);
  if (next.length !== arr.length) await writeArr(env, key, next);
}

/* ---------- GET ---------- */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;
  const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = JSON.parse(raw) as Tournament;
  const v = await getV(env, id);
  return NextResponse.json(doc, { headers: { "x-t-version": String(v), "Cache-Control": "no-store" } });
}

/* ---------- PUT (If-Match) ---------- */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const ifMatch = req.headers.get("if-match");
  const curV = await getV(env, id);
  if (ifMatch !== null && String(curV) !== String(ifMatch)) {
    return NextResponse.json({ error: "Version conflict" }, { status: 412 });
  }

  // read previous to update player indices and detect ping change
  const prevRaw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  const prev: Tournament | null = prevRaw ? JSON.parse(prevRaw) : null;
  const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));
  const prevPingAt = prev?.lastPingAt || 0;

  let body: Tournament;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  await env.KAVA_TOURNAMENTS.put(TKEY(id), JSON.stringify(body));
  const nextV = curV + 1;
  await setV(env, id, nextV);

  // update per-player indices
  const nextPlayers = new Set((body.players ?? []).map(p => p.id));
  for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(env, PIDX(p), id);
  for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(env, PIDX(p), id);

  // 🔔 Push on ping change
  const changedPing = !!body.lastPingAt && body.lastPingAt !== prevPingAt;
  if (changedPing && typeof body.lastPingR === 'number' && typeof body.lastPingM === 'number') {
    const r = body.rounds?.[body.lastPingR]?.[body.lastPingM];
    if (r) {
      const targets: string[] = [];
      if (r.a) targets.push(r.a);
      if (r.b) targets.push(r.b);
      // title/body + optional deeplink
      await sendPushToPlayers(
        targets,
        "You're up!",
        "Head to your table — your match is ready.",
        `https://${req.headers.get('host') || ''}/t/${id}`
      );
    }
  }

  return new NextResponse(null, { status: 204, headers: { "x-t-version": String(nextV) } });
}

/* ---------- DELETE ---------- */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (raw) {
    try {
      const doc = JSON.parse(raw) as Tournament;
      if (doc.code) await env.KAVA_TOURNAMENTS.delete(`code:${doc.code}`);
      // remove from all player indices
      for (const p of (doc.players || [])) await removeFrom(env, PIDX(p.id), id);
    } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(TKEY(id));
  await env.KAVA_TOURNAMENTS.delete(TVER(id));
  return new NextResponse(null, { status: 204 });
}
