// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const TKEY  = (id: string) => `t:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`;
const TPLAY = (pid: string)   => `tidx:p:${pid}`;

type Player = { id: string; name: string };
type Tournament = {
  id: string; hostId: string; name: string; code?: string; createdAt: number;
  players: Player[]; pending: Player[];
};

function coerceT(raw:any): Tournament | null {
  if (!raw) return null;
  try {
    return {
      id:String(raw.id ?? ""), hostId:String(raw.hostId ?? ""),
      name:String(raw.name ?? "Untitled"),
      code: raw.code ? String(raw.code) : undefined,
      createdAt: Number(raw.createdAt ?? Date.now()),
      players: Array.isArray(raw.players) ? raw.players.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [],
      pending: Array.isArray(raw.pending) ? raw.pending.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [],
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ error:"userId required" }, { status: 400 });

  const [hostIdsRaw, playIdsRaw] = await Promise.all([
    env.KAVA_TOURNAMENTS.get(THOST(userId)),
    env.KAVA_TOURNAMENTS.get(TPLAY(userId)),
  ]);

  const hostIds = (hostIdsRaw ? JSON.parse(hostIdsRaw) : []) as string[];
  const playIds = (playIdsRaw ? JSON.parse(playIdsRaw) : []) as string[];

  const ids = Array.from(new Set([...(hostIds||[]), ...(playIds||[])]));
  const docs = await Promise.all(ids.map(async id => {
    const r = await env.KAVA_TOURNAMENTS.get(TKEY(id));
    if (!r) return null;
    return coerceT(JSON.parse(r));
  }));

  const hosting: Tournament[] = [];
  const playing: Tournament[] = [];
  for (const t of docs) {
    if (!t) continue;
    if (t.hostId === userId) hosting.push(t);
    if (t.players.some(p => p.id === userId) || t.pending.some(p => p.id === userId)) playing.push(t);
  }

  // newest first
  hosting.sort((a,b)=>b.createdAt-a.createdAt);
  playing.sort((a,b)=>b.createdAt-a.createdAt);

  return NextResponse.json({ hosting, playing }, { headers: { "cache-control":"no-store" } });
}
