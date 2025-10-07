// src/app/api/create/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

const randomUUID = () => crypto.randomUUID();

function random4Digits(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: Request) {
  const { env } = getRequestContext();
  const kv = (env as unknown as Env).KAVA_TOURNAMENTS;

  const body = await req.json().catch(() => ({} as { name?: string; hostId?: string }));
  const name = body.name || "Untitled Tournament";
  const hostId = body.hostId || randomUUID();
  const code = random4Digits();
  const id = randomUUID();

  const tournament = {
    id,
    code,
    name,
    hostId,
    players: [] as Array<{ id: string; name: string }>,
    queue: [] as string[],
    pending: [] as Array<{ id: string; name: string }>,
    rounds: [] as Array<Array<unknown>>,
    status: "setup",
    createdAt: new Date().toISOString(),
  };

  await kv.put(`code:${code}`, id);
  await kv.put(`t:${id}`, JSON.stringify(tournament));

  return NextResponse.json({ ok: true, id, code, tournament });
}
