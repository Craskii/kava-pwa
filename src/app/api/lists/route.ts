// src/app/api/lists/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KV = { get(k:string):Promise<string|null> };
type Env = { KAVA_TOURNAMENTS: KV };

type Player = { id:string; name:string };
type Table = { a?:string; b?:string; label:"8 foot"|"9 foot" };

type ListGame = {
  id:string; name:string; code?:string; hostId:string;
  status:"active"; createdAt:number;
  tables:Table[]; players:Player[];
  queue8?:string[]; queue9?:string[]; queue?:string[];
  coHosts?:string[];
};

const LKEY = (id:string)=>`l:${id}`;
const LHOST= (hostId:string)=>`lidx:h:${hostId}`;
const LPLAY= (pid:string)=>`lidx:p:${pid}`;

async function readArr(env:Env, key:string):Promise<string[]>{
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
function pick(raw:string|null):ListGame|null{
  if(!raw) return null;
  try{
    const d = JSON.parse(raw);
    return {
      id:String(d?.id??""), name:String(d?.name??"Untitled"),
      code: d?.code?String(d.code):undefined,
      hostId:String(d?.hostId??""), status:"active",
      createdAt:Number(d?.createdAt ?? Date.now()),
      tables: Array.isArray(d?.tables) ? d.tables : [],
      players: Array.isArray(d?.players) ? d.players : [],
      queue8: Array.isArray(d?.queue8) ? d.queue8 : [],
      queue9: Array.isArray(d?.queue9) ? d.queue9 : [],
      queue:  Array.isArray(d?.queue)  ? d.queue  : undefined,
      coHosts: Array.isArray(d?.coHosts) ? d.coHosts.map(String) : [],
    };
  }catch{ return null; }
}

export async function GET(req:Request){
  const { env:raw } = getRequestContext(); const env = raw as unknown as Env;
  const userId = (new URL(req.url)).searchParams.get("userId") || "";
  if(!userId) return NextResponse.json({ error:"Missing userId" },{ status:400 });

  const [hIds, pIds] = await Promise.all([
    readArr(env, LHOST(userId)),
    readArr(env, LPLAY(userId)),
  ]);

  const uniq = (a:string[]) => Array.from(new Set(a));
  const [hosting, playing] = await Promise.all([
    Promise.all(uniq(hIds).map(async id => pick(await env.KAVA_TOURNAMENTS.get(LKEY(id))))),
    Promise.all(uniq(pIds).map(async id => pick(await env.KAVA_TOURNAMENTS.get(LKEY(id))))),
  ]);

  return NextResponse.json({
    hosting: hosting.filter(Boolean).map(x => ({ id:x!.id, hostId:x!.hostId, name:x!.name, code:x!.code, createdAt:x!.createdAt, players:x!.players })),
    playing: playing.filter(Boolean).map(x => ({ id:x!.id, hostId:x!.hostId, name:x!.name, code:x!.code, createdAt:x!.createdAt, players:x!.players })),
  }, { headers:{ "cache-control":"no-store" }});
}
