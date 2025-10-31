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

type ListDoc = {
  id: string;
  hostId: string;
  players: { id: string; name: string }[];
  createdAt: number;
  updatedAt?: number;
  name: string;
  code?: string;
  tables?: any[];
  queue?: string[];
  queue8?: string[];
  queue9?: string[];
  prefs?: Record<string, string>;
};

async function readIds(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const url = new URL(req.url);
  const qsUser = url.searchParams.get("userId");
  const hdrUser = req.headers.get("x-user-id");
  const userId = (qsUser || hdrUser || "").trim();

  if (!userId) {
    return NextResponse.json(
      { error: "Missing userId. Pass ?userId=... or header x-user-id." },
      { status: 400 }
    );
  }

  const [hostIds, playIds] = await Promise.all([
    readIds(env, LHOST(userId)),
    readIds(env, LPLAYER(userId)),
  ]);

  const fetchMany = async (ids: string[]) => {
    const out: ListDoc[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (!raw) continue;
      try { out.push(JSON.parse(raw) as ListDoc); } catch {}
    }
    return out;
  };

  const [hosting, playing] = await Promise.all([ fetchMany(hostIds), fetchMany(playIds) ]);

  // combined version (optional header, mirrors tournaments route style)
  let maxV = 0;
  const uniq = [...new Set([...hostIds, ...playIds])];
  for (const id of uniq) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(LVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }

  hosting.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  playing.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "x-l-version": String(maxV),
      "cache-control": "no-store",
    },
  });
}
