// src/app/api/create/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function random4() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

type Player = { id: string; name: string };
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, "win" | "loss" | undefined> };
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "setup" | "active" | "completed";
  createdAt: number; // Date.now()
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const body = await req.json().catch(() => ({} as { name?: string; hostId?: string }));
  const name = (body.name || "Untitled Tournament").toString();
  const hostId = (body.hostId || uid()).toString();

  // unique-ish 4-digit join code (retry a few times if collision)
  let code = random4();
  for (let i = 0; i < 4; i++) {
    const taken = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
    if (!taken) break;
    code = random4();
  }

  const id = crypto.randomUUID();
  const t: Tournament = {
    id,
    name,
    code,
    hostId,
    status: "setup",
    createdAt: Date.now(),
    players: [{ id: hostId, name: "Host" }], // host present by default (adjust as you wish)
    pending: [],
    queue: [],
    rounds: [],
  };

  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(t));

  return NextResponse.json({ ok: true, id, code, tournament: t });
}
