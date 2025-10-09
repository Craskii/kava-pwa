// src/app/api/create/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- Cloudflare KV types ---------- */
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* ---------- app data types ---------- */
type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type TournamentStatus = "setup" | "active" | "completed";
type Tournament = {
  id: string;
  name: string;
  code?: string;                 // now always 5 digits
  hostId: string;
  status: TournamentStatus;
  createdAt: number;
  players: Player[];
  pending: Player[];
  queue: string[];               // we still keep it on the object to avoid breaking, but UI won’t use it
  rounds: Match[][];
};
type CreateBody = { name?: string; hostId?: string };

/* ---------- helpers ---------- */
function random5(): string {
  // 00000–99999 with left-padding
  return Math.floor(Math.random() * 100000).toString().padStart(5, "0");
}

async function uniqueNumericCode(env: Env): Promise<string> {
  // Try a few times to avoid collisions
  for (let i = 0; i < 10; i++) {
    const c = random5();
    const exists = await env.KAVA_TOURNAMENTS.get(`code:${c}`);
    if (!exists) return c;
  }
  // Fallback (extremely unlikely to hit)
  return random5();
}

/* ---------- route ---------- */
export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: CreateBody = {};
  try { body = await req.json(); } catch {}

  const name = (body.name ?? "Untitled Tournament").toString();
  const hostId = (body.hostId ?? crypto.randomUUID()).toString();

  const id = crypto.randomUUID();
  const code = await uniqueNumericCode(env);

  const tournament: Tournament = {
    id,
    code,
    name,
    hostId,
    status: "setup",
    createdAt: Date.now(),
    players: [],        // host will be auto-added client-side on first open
    pending: [],
    queue: [],
    rounds: [],
  };

  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(tournament));

  return NextResponse.json({ ok: true, id, code, tournament });
}
