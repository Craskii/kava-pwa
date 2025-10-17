// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LKEY = (id: string) => `l:${id}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;
const LHOST = (hostId: string) => `lidx:h:${hostId}`;

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const u = new URL(req.url);
  const userId = u.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  async function loadIds(key: string): Promise<string[]> {
    const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
    try { return JSON.parse(raw); } catch { return []; }
  }

  const [hostIds, playIds] = await Promise.all([
    loadIds(LHOST(userId)),
    loadIds(LPLAYER(userId)),
  ]);

  const uniq = (arr: string[]) => Array.from(new Set(arr));
  const hostUniq = uniq(hostIds);
  const playUniq = uniq(playIds.filter(id => !hostUniq.includes(id)));

  async function fetchMany(ids: string[]) {
    const out: any[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (!raw) continue;
      try { out.push(JSON.parse(raw)); } catch {}
    }
    return out;
  }

  const [hosting, playing] = await Promise.all([fetchMany(hostUniq), fetchMany(playUniq)]);
  hosting.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
  playing.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));

  return NextResponse.json({ hosting, playing }, { headers: { "cache-control":"no-store" } });
}
