// src/app/api/create/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

function random4Digits() {
  // 1000..9999
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const body = await req.json().catch(() => ({} as any));
  const name = (body?.name ?? "Untitled Tournament").toString();
  const hostId = (body?.hostId ?? crypto.randomUUID()).toString();

  const code = random4Digits();
  const id = crypto.randomUUID();

  const tournament = {
    id,
    code,
    name,
    hostId,
    players: [] as { id: string; name: string }[],
    pending: [] as { id: string; name: string }[],
    queue: [] as string[],
    rounds: [] as any[][],
    status: "setup" as const,
    createdAt: Date.now(),
  };

  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(tournament));

  return NextResponse.json({ ok: true, id, code, tournament });
}
