// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Player = { id: string; name: string };
type Table  = { a?: string; b?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active";
  createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};

const LKEY    = (id: string) => `l:${id}`;
const LHOST   = (hostId: string) => `lidx:h:${hostId}`;  // string[]
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`; // string[]

async function readIds(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const u = new URL(req.url);
  const userId = u.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Read indices (no KV.list scanning)
  const hostIds   = await readIds(env, LHOST(userId));
  const playerIds = await readIds(env, LPLAYER(userId));

  const seen = new Set<string>();
  const hosting: ListGame[] = [];
  const playing: ListGame[] = [];

  for (const id of hostIds) {
    if (seen.has(id)) continue; seen.add(id);
    const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
    if (!raw) continue;
    try { hosting.push(JSON.parse(raw) as ListGame); } catch {}
  }

  for (const id of playerIds) {
    if (seen.has(id)) continue; seen.add(id);
    const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
    if (!raw) continue;
    try { playing.push(JSON.parse(raw) as ListGame); } catch {}
  }

  hosting.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  playing.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  const listVersion = Math.max(0, ...hosting.map(t=>t.createdAt||0), ...playing.map(t=>t.createdAt||0));
  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: { "content-type":"application/json", "x-l-version": String(listVersion) }
  });
}
