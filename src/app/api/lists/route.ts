// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LKEY  = (id: string) => `l:${id}`;
const LVER  = (id: string) => `lv:${id}`;
const LHOST = (hostId: string) => `lidx:h:${hostId}`; // string[]
const LPLAY = (pid: string)    => `lidx:p:${pid}`;    // string[]

type Player = { id: string; name: string };
type TableLabel = "8 foot" | "9 foot";
type Table = { a?: string; b?: string; label: TableLabel };
type ListGame = {
  id: string; name: string; hostId: string; code?: string;
  status: "active"; createdAt: number;
  tables: Table[]; players: Player[]; queue?: string[];
};

async function readIds(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const players: Player[] = Array.isArray(raw.players) ? raw.players.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t:any,i:number)=>({
          a: t?.a?String(t.a):undefined,
          b: t?.b?String(t.b):undefined,
          label: (t?.label==="9 foot"||t?.label==="8 foot") ? t.label : (i===1?"9 foot":"8 foot"),
        }))
      : [{label:"8 foot"},{label:"9 foot"}];
    return {
      id:String(raw.id??""), name:String(raw.name??"Untitled"), hostId:String(raw.hostId??""), code: raw.code?String(raw.code):undefined,
      status: "active", createdAt: Number(raw.createdAt ?? Date.now()),
      tables, players, queue: Array.isArray(raw.queue) ? raw.queue.map(String) : [],
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || req.headers.get("x-user-id") || "").trim();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const [hostIds, playIds] = await Promise.all([
    readIds(env, LHOST(userId)),
    readIds(env, LPLAY(userId)),
  ]);

  const fetchMany = async (ids: string[]) => {
    const out: ListGame[] = [];
    for (const id of ids) {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (!raw) continue;
      const doc = coerceList(JSON.parse(raw));
      if (doc) out.push(doc);
    }
    return out;
  };

  const [hosting, playing] = await Promise.all([fetchMany(hostIds), fetchMany(playIds)]);

  let maxV = 0;
  const uniq = [...new Set([...hostIds, ...playIds])];
  for (const id of uniq) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(LVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }

  hosting.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  playing.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "x-l-version": String(maxV),
      "cache-control": "no-store",
    }
  });
}
