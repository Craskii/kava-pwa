// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const THOST = (hostId: string) => `tidx:h:${hostId}`; // string[]
const TPLAYER = (playerId: string) => `tidx:p:${playerId}`; // string[]
const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;

type Tournament = {
  id: string; hostId: string; players: { id: string; name: string }[];
  createdAt: number; updatedAt?: number; name: string; code?: string;
};

async function readIds(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const u = new URL(req.url);
  const userId = u.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const [hostIds, playIds] = await Promise.all([
    readIds(env, THOST(userId)),
    readIds(env, TPLAYER(userId)),
  ]);

  const fetchMany = async (ids: string[]) => {
    const out: Tournament[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
      if (raw) out.push(JSON.parse(raw));
    }
    return out;
  };

  const [hosting, playing] = await Promise.all([
    fetchMany(hostIds),
    fetchMany(playIds),
  ]);

  // combined version = max of versions so the page can smart-poll
  let maxV = 0;
  for (const id of [...new Set([...hostIds, ...playIds])]) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(TVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }

  hosting.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  playing.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "x-t-version": String(maxV),
      "cache-control": "no-store"
    }
  });
}
