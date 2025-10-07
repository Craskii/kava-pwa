// src/app/api/create/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

function random4Digits() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const body = await req.json().catch(() => ({}));
  const name = body.name || "Untitled Tournament";
  const hostId = body.hostId || randomUUID();

  const code = random4Digits();
  const id = randomUUID();

  const tournament = {
    id,
    code,
    name,
    hostId,
    players: [],
    queue: [],
    pending: [],
    rounds: [],
    status: "setup",
    createdAt: new Date().toISOString(),
  };

  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(tournament));

  return NextResponse.json({ ok: true, id, code, tournament });
}
