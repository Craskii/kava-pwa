// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LHOST   = (hostId: string)   => `lidx:h:${hostId}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;
const LKEY    = (id: string)       => `l:${id}`;
const LVER    = (id: string)       => `lv:${id}`;

type ListSummary = { id: string; name: string; createdAt: number; code?: string; hostId: string };

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
    readIds(env, LHOST(userId)),
    readIds(env, LPLAYER(userId)),
  ]);

  const fetchMany = async (ids: string[]) => {
    const out: ListSummary[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (raw) {
        try {
          const doc = JSON.parse(raw);
          out.push({ id: doc.id, name: doc.name, code: doc.code, hostId: doc.hostId, createdAt: doc.createdAt || 0 });
        } catch {}
      }
    }
    return out;
  };

  const [hosting, playing] = await Promise.all([fetchMany(hostIds), fetchMany(playIds)]);

  let maxV = 0;
  const uniq = new Set([...hostIds, ...playIds]);
  for (const id of uniq) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(LVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }

  hosting.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  playing.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "x-lists-version": String(maxV),
      "cache-control": "no-store"
    }
  });
}
