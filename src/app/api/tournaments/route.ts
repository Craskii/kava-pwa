// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KV = { get(k:string):Promise<string|null>; put(k:string,v:string):Promise<void> };
type Env = { KAVA_TOURNAMENTS: KV };

type Player = { id:string; name:string };
type Match = { a?:string; b?:string; winner?:string; reports?:Record<string,"win"|"loss"> };
type Tournament = {
  id:string; name:string; code?:string; hostId:string;
  players:Player[]; pending:Player[]; rounds:Match[][];
  status:"setup"|"active"|"completed"; createdAt:number; updatedAt?:number;
  coHosts?: string[];
};

const TKEY  = (id: string) => `t:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`;
const TPLAY = (pid: string) => `tidx:p:${pid}`;

async function readArr(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
function pick(t: any): Tournament | null {
  try {
    const p = JSON.parse(t) as Tournament;
    if (!p?.id) return null;
    return {
      id: String(p.id),
      name: String(p.name ?? "Untitled"),
      code: p.code ? String(p.code) : undefined,
      hostId: String(p.hostId ?? ""),
      players: Array.isArray(p.players) ? p.players : [],
      pending: Array.isArray(p.pending) ? p.pending : [],
      rounds: Array.isArray(p.rounds) ? p.rounds : [],
      status: (p.status === "setup" || p.status === "active" || p.status === "completed") ? p.status : "setup",
      createdAt: Number(p.createdAt ?? Date.now()),
      updatedAt: Number(p.updatedAt ?? Date.now()),
      coHosts: Array.isArray(p.coHosts) ? p.coHosts.map(String) : [],
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const { env: raw } = getRequestContext(); const env = raw as unknown as Env;
  const userId = (new URL(req.url)).searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ error:"Missing userId" },{ status:400 });

  const [hostingIds, playingIds] = await Promise.all([
    readArr(env, THOST(userId)),
    readArr(env, TPLAY(userId)), // includes “pending” memberships too
  ]);

  const uniq = (xs: string[]) => Array.from(new Set(xs));
  const hIds = uniq(hostingIds);
  const pIds = uniq(playingIds);

  const [hosting, playing] = await Promise.all([
    Promise.all(hIds.map(async id => pick(await env.KAVA_TOURNAMENTS.get(TKEY(id)) || "null"))),
    Promise.all(pIds.map(async id => pick(await env.KAVA_TOURNAMENTS.get(TKEY(id)) || "null"))),
  ]);

  return NextResponse.json({
    hosting: hosting.filter(Boolean).map(t => ({ id:t!.id, hostId:t!.hostId, name:t!.name, code:t!.code, createdAt:t!.createdAt, players:t!.players })),
    playing: playing.filter(Boolean).map(t => ({ id:t!.id, hostId:t!.hostId, name:t!.name, code:t!.code, createdAt:t!.createdAt, players:t!.players })),
  }, { headers: { "cache-control":"no-store" }});
}
