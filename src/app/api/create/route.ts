// src/app/api/create/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getEnv } from "../_kv";

type Body = { name: string; hostId: string };

function uid() { return Math.random().toString(36).slice(2, 9); }

export async function POST(req: Request) {
  const env = getEnv();

  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.name || !b?.hostId) {
    return NextResponse.json({ error: "Missing name or hostId" }, { status: 400 });
  }

  const id = uid();
  const code = uid().toUpperCase();
  const now = Date.now();

  const tournament = {
    id,
    name: b.name,
    code,
    hostId: b.hostId,
    status: "setup" as const,
    createdAt: now,
    updatedAt: now,
    players: [{ id: b.hostId, name: "Host" }], // host joins bracket by default
    pending: [],
    queue: [],
    rounds: [],
  };

  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(tournament));
  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);

  return new NextResponse(JSON.stringify({ id, code, tournament }), {
    headers: {
      "content-type": "application/json",
      "x-t-version": String(tournament.updatedAt),
    },
  });
}
