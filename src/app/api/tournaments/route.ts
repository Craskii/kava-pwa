// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Tourney = {
  id: string;
  name: string;
  hostId: string;
  status: "setup" | "active" | "done";
  createdAt: number;
  players?: { id: string; name: string }[];
};

const TKEY = (id: string) => `t:${id}`;
const TPLAYER = (pid: string) => `tidx:p:${pid}`;
const THOST = (hid: string) => `tidx:h:${hid}`;

async function readIds(env: Env, key: string): Promise<string[]> {
  try { return JSON.parse((await env.KAVA_TOURNAMENTS.get(key)) || "[]"); } catch { return []; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const [hostingIds, playingIds] = await Promise.all([
    readIds(env, THOST(userId)),
    readIds(env, TPLAYER(userId)),
  ]);

  async function hydrate(ids: string[]): Promise<Tourney[]> {
    const out: Tourney[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
      if (!raw) continue;
      try {
        const t = JSON.parse(raw) as Tourney;
        out.push({
          id: String(t.id),
          name: String(t.name || "Untitled"),
          hostId: String(t.hostId || ""),
          status: (t.status as any) || "setup",
          createdAt: Number(t.createdAt || Date.now()),
        });
      } catch {}
    }
    // newest first
    return out.sort((a,b)=>b.createdAt - a.createdAt);
  }

  const [hosting, playing] = await Promise.all([hydrate(hostingIds), hydrate(playingIds)]);
  return NextResponse.json({ hosting, playing }, { headers: { "cache-control": "no-store" } });
}
