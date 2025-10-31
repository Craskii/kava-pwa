// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LKEY  = (id: string) => `l:${id}`;
const LHOST = (hostId: string) => `lidx:h:${hostId}`;
const LPLAY = (pid: string) => `lidx:p:${pid}`;

async function readIds(env: Env, key: string): Promise<string[]> {
  try { return JSON.parse((await env.KAVA_TOURNAMENTS.get(key)) || "[]"); } catch { return []; }
}

function djb2(str: string): string {
  let h = 5381;
  for (let i=0; i<str.length; i++) h = ((h<<5)+h) + str.charCodeAt(i);
  return String(h >>> 0);
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const [hostingIds, playingIds] = await Promise.all([
    readIds(env, LHOST(userId)),
    readIds(env, LPLAY(userId)),
  ]);

  async function hydrate(ids: string[]) {
    const out: { id: string; name: string; createdAt: number; code?: string; hostId: string }[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (!raw) continue;
      try {
        const d = JSON.parse(raw);
        out.push({
          id: String(d.id),
          name: String(d.name || "Untitled"),
          hostId: String(d.hostId || ""),
          createdAt: Number(d.createdAt || Date.now()),
          code: d.code ? String(d.code) : undefined,
        });
      } catch {}
    }
    return out.sort((a,b)=>b.createdAt - a.createdAt);
  }

  const [hosting, playing] = await Promise.all([hydrate(hostingIds), hydrate(playingIds)]);

  // Stable version for your startSmartPollETag
  const versionSeed = JSON.stringify({
    h: hosting.map(x=>x.id),
    p: playing.map(x=>x.id),
  });
  const version = djb2(versionSeed);

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-lists-version": version,
    },
  });
}
