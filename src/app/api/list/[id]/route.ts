export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Table = { a?: string; b?: string };
type Player = { id: string; name: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active";
  createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`; // string[]
const LHOST   = (hostId: string)   => `lidx:h:${hostId}`;   // string[]

async function getV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(LVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(LVER(id), String(v));
}
async function readArr(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
async function writeArr(env: Env, key: string, arr: string[]) {
  await env.KAVA_TOURNAMENTS.put(key, JSON.stringify(arr));
}
async function addTo(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  if (!arr.includes(id)) { arr.push(id); await writeArr(env, key, arr); }
}
async function removeFrom(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  const next = arr.filter(x => x !== id);
  if (next.length !== arr.length) await writeArr(env, key, next);
}

/* Coerce on read to avoid missing fields breaking clients */
function coerce(doc: any): ListGame {
  return {
    id: String(doc?.id ?? ""),
    name: String(doc?.name ?? "Untitled"),
    code: doc?.code ? String(doc.code) : undefined,
    hostId: String(doc?.hostId ?? ""),
    status: "active",
    createdAt: Number(doc?.createdAt ?? Date.now()),
    tables: Array.isArray(doc?.tables) ? doc.tables.map((t: any) => ({ a: t?.a, b: t?.b })) : [],
    players: Array.isArray(doc?.players) ? doc.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") })) : [],
    queue: Array.isArray(doc?.queue) ? doc.queue.map((id: any) => String(id)) : [],
  };
}

/* GET */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;
  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = coerce(JSON.parse(raw));
  const v = await getV(env, id);
  return new NextResponse(JSON.stringify(doc), {
    headers: { "content-type":"application/json", "x-l-version": String(v), "cache-control":"no-store" }
  });
}

/* PUT (optimistic concurrency with If-Match) */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const ifMatch = req.headers.get("if-match");
  const curV = await getV(env, id);
  if (ifMatch !== null && String(curV) !== String(ifMatch)) {
    return NextResponse.json({ error: "Version conflict" }, { status: 412 });
  }

  const prevRaw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  const prev = prevRaw ? coerce(JSON.parse(prevRaw)) : null;
  const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));

  let body: ListGame;
  try { body = coerce(await req.json()); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(body));
  const nextV = curV + 1;
  await setV(env, id, nextV);

  // keep indices in sync (players + host)
  const nextPlayers = new Set((body.players ?? []).map(p => p.id));
  for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(env, LPLAYER(p), id);
  for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(env, LPLAYER(p), id);

  if (prev?.hostId && prev.hostId !== body.hostId) {
    await removeFrom(env, LHOST(prev.hostId), id);
  }
  if (body.hostId) await addTo(env, LHOST(body.hostId), id);

  return new NextResponse(null, { status: 204, headers: { "x-l-version": String(nextV) } });
}

/* DELETE */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  if (raw) {
    try {
      const doc = coerce(JSON.parse(raw));
      if (doc.code) await env.KAVA_TOURNAMENTS.delete(`code:${doc.code}`);
      for (const p of (doc.players || [])) await removeFrom(env, LPLAYER(p.id), id);
      if (doc.hostId) await removeFrom(env, LHOST(doc.hostId), id);
    } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(LKEY(id));
  await env.KAVA_TOURNAMENTS.delete(LVER(id));
  return new NextResponse(null, { status: 204 });
}
