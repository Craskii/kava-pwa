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

type Player = { id: string; name: string };
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string,"win"|"loss"> };
type Tournament = {
  id: string; name: string; code?: string; hostId: string;
  players: Player[]; pending: Player[]; rounds: Match[][];
  status: "setup"|"active"|"completed"; createdAt: number; updatedAt?: number;
  coHosts?: string[];
};

const TKEY  = (id: string)      => `t:${id}`;
const THOST = (hostId: string)  => `tidx:h:${hostId}`;
const TPLAY = (pid: string)     => `tidx:p:${pid}`;

async function readArr(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function coerceTournament(raw:any): Tournament | null {
  if (!raw) return null;
  try {
    const players: Player[] = Array.isArray(raw.players) ? raw.players.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const pending: Player[] = Array.isArray(raw.pending) ? raw.pending.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const status = (raw.status==="setup"||raw.status==="active"||raw.status==="completed") ? raw.status : "setup";
    return {
      id:String(raw.id??""), name:String(raw.name??"Untitled"), code: raw.code?String(raw.code):undefined,
      hostId:String(raw.hostId??""), players, pending, rounds:Array.isArray(raw.rounds)?raw.rounds:[],
      status, createdAt:Number(raw.createdAt??Date.now()), updatedAt:Number(raw.updatedAt??Date.now()),
      coHosts: Array.isArray(raw.coHosts) ? raw.coHosts.map(String) : [],
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || req.headers.get("x-user-id") || "").trim();
  if (!userId) return NextResponse.json({ error:"Missing userId" }, { status: 400 });

  // Indexes
  const [hostingIds, playingIds] = await Promise.all([
    readArr(env, THOST(userId)),
    readArr(env, TPLAY(userId)),
  ]);

  // Load docs (dedup)
  const ids = Array.from(new Set([ ...hostingIds, ...playingIds ]));
  const docs = await Promise.all(ids.map(async id => {
    const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
    return raw ? coerceTournament(JSON.parse(raw)) : null;
  }));
  const ts = docs.filter(Boolean) as Tournament[];

  // Split
  const hosting = ts.filter(t => t.hostId === userId);
  const playing = ts.filter(t =>
    t.hostId !== userId &&
    (t.players.some(p=>p.id===userId) || t.pending.some(p=>p.id===userId))
  );

  // Small shape for list page
  const slim = (t: Tournament) => ({ id:t.id, hostId:t.hostId, name:t.name, code:t.code, createdAt:t.createdAt, players:t.players });

  return NextResponse.json({
    hosting: hosting.map(slim),
    playing: playing.map(slim),
  }, { headers: { "cache-control":"no-store" }});
}
