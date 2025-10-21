// src/app/api/list/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* KV + types */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Table = { a?: string; b?: string; label: "8 foot" | "9 foot" };
type Player = { id: string; name: string };

/** New list model: two queues */
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue8: string[]; // 8-foot queue
  queue9: string[]; // 9-foot queue
};

/* keys + helpers */
const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;
const LHOST   = (hostId: string)   => `lidx:h:${hostId}`;

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

/** Back-compat coercion from older single-queue model */
function coerce(doc: any): ListGame {
  const players: Player[] = Array.isArray(doc?.players)
    ? doc.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") }))
    : [];

  // tables: if old shape had no labels, assign [8,9] for first two, otherwise default to 8
  const tables: Table[] = Array.isArray(doc?.tables)
    ? doc.tables.map((t: any, i: number) => ({
        a: t?.a, b: t?.b,
        label: (t?.label === "9 foot" || t?.label === "8 foot")
          ? t.label
          : (i === 1 ? "9 foot" : "8 foot")
      }))
    : [{ label: "8 foot" }, { label: "9 foot" }];

  // queues: migrate legacy "queue" → queue8; create queue9 empty
  const queue8: string[] = Array.isArray(doc?.queue8)
    ? doc.queue8.map((x: any) => String(x))
    : (Array.isArray(doc?.queue) ? doc.queue.map((x: any) => String(x)) : []);
  const queue9: string[] = Array.isArray(doc?.queue9)
    ? doc.queue9.map((x: any) => String(x))
    : [];

  return {
    id: String(doc?.id ?? ""),
    name: String(doc?.name ?? "Untitled"),
    code: doc?.code ? String(doc.code) : undefined,
    hostId: String(doc?.hostId ?? ""),
    status: "active",
    createdAt: Number(doc?.createdAt ?? Date.now()),
    tables,
    players,
    queue8,
    queue9,
  };
}

/** Utility: remove a player id from both queues */
function dropFromQueues(x: ListGame, pid?: string) {
  if (!pid) return;
  x.queue8 = x.queue8.filter(id => id !== pid);
  x.queue9 = x.queue9.filter(id => id !== pid);
}

/** Server-side reconcile:
 *  - If a seat is empty, pull next from the matching queue (by table label)
 *  - Ensure players aren’t seated twice
 *  - When seated, remove from both queues
 */
function reconcileSeating(x: ListGame) {
  const seated = new Set<string>();
  for (const t of x.tables) {
    if (t.a) seated.add(t.a);
    if (t.b) seated.add(t.b);
  }

  function nextFrom(label: "8 foot" | "9 foot"): string | undefined {
    const src = label === "9 foot" ? x.queue9 : x.queue8;
    while (src.length) {
      const pid = src.shift()!;
      if (!seated.has(pid)) return pid;
    }
    return undefined;
  }

  for (const t of x.tables) {
    if (!t.a) {
      const pid = nextFrom(t.label);
      if (pid) { t.a = pid; seated.add(pid); dropFromQueues(x, pid); }
    }
    if (!t.b) {
      const pid = nextFrom(t.label);
      if (pid) { t.b = pid; seated.add(pid); dropFromQueues(x, pid); }
    }
  }
}

/* ---------- GET (ETag/304) ---------- */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const v = await getV(env, id);
  const etag = `"l-${v}"`;
  const inm = req.headers.get("if-none-match");
  if (inm && inm === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
        "x-l-version": String(v),
      }
    });
  }

  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Coerce and re-store if we had to migrate shape
  const doc = coerce(JSON.parse(raw));
  const serialized = JSON.stringify(doc);

  return new NextResponse(serialized, {
    headers: {
      "content-type": "application/json",
      ETag: etag,
      "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
      "x-l-version": String(v),
    }
  });
}

/* ---------- PUT (If-Match) ---------- */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const ifMatch = req.headers.get("if-match");
  const curV = await getV(env, id);
  if (ifMatch !== null && String(curV) !== String(ifMatch)) {
    return NextResponse.json({ error: "Version conflict" }, { status: 412 });
  }

  // read previous for indices
  const prevRaw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  const prev = prevRaw ? coerce(JSON.parse(prevRaw)) : null;
  const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));

  let body: ListGame;
  try { body = coerce(await req.json()); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  // Always reconcile before save
  reconcileSeating(body);

  await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(body));
  const nextV = curV + 1;
  await setV(env, id, nextV);

  // indices: players + host
  const nextPlayers = new Set((body.players ?? []).map(p => p.id));
  for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(env, LPLAYER(p), id);
  for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(env, LPLAYER(p), id);

  if (prev?.hostId && prev.hostId !== body.hostId) await removeFrom(env, LHOST(prev.hostId), id);
  if (body.hostId) await addTo(env, LHOST(body.hostId), id);

  return new NextResponse(null, { status: 204, headers: { "x-l-version": String(nextV), ETag: `"l-${nextV}"` } });
}

/* ---------- DELETE ---------- */
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
