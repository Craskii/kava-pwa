// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/** KV */
type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LHOST   = (hostId: string)   => `lidx:h:${hostId}`;     // string[]
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;   // string[]
const LKEY    = (id: string)       => `l:${id}`;
const LVER    = (id: string)       => `lv:${id}`;

type Player = { id: string; name: string };
type Table  = { a?: string; b?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string;
  status: "active"; createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};

async function readIds(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
async function fetchMany(env: Env, ids: string[]): Promise<ListGame[]> {
  const out: ListGame[] = [];
  for (const id of ids) {
    const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
    if (raw) out.push(JSON.parse(raw));
  }
  return out;
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;

  const u = new URL(req.url);
  const userId = u.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // ids indexed by host and by player
  const [hostIds, playIds] = await Promise.all([
    readIds(env, LHOST(userId)),
    readIds(env, LPLAYER(userId)),
  ]);

  const [hosting, playing] = await Promise.all([
    fetchMany(env, hostIds),
    fetchMany(env, playIds),
  ]);

  // compute a combined version so the page can ETag/304 and smart-poll
  let maxV = 0;
  const unique = [...new Set([...hostIds, ...playIds])];
  for (const id of unique) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(LVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }

  hosting.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  playing.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "x-l-version": String(maxV),
      "cache-control": "no-store",
      ETag: `"li-${maxV}"`,
    }
  });
}
