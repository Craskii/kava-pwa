// src/app/api/list/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getEnvOrError, KVNamespace } from "../../_utils/env";

type Table = { a?: string; b?: string };
type Player = { id: string; name: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active";
  createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;
const LHOST   = (hostId: string)   => `lidx:h:${hostId}`;

async function getV(kv: KVNamespace, id: string): Promise<number> {
  const raw = await kv.get(LVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(kv: KVNamespace, id: string, v: number) {
  await kv.put(LVER(id), String(v));
}
async function readArr(kv: KVNamespace, key: string): Promise<string[]> {
  const raw = (await kv.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
async function writeArr(kv: KVNamespace, key: string, arr: string[]) {
  await kv.put(key, JSON.stringify(arr));
}
async function addTo(kv: KVNamespace, key: string, id: string) {
  const arr = await readArr(kv, key);
  if (!arr.includes(id)) { arr.push(id); await writeArr(kv, key, arr); }
}
async function removeFrom(kv: KVNamespace, key: string, id: string) {
  const arr = await readArr(kv, key);
  const next = arr.filter(x => x !== id);
  if (next.length !== arr.length) await writeArr(kv, key, next);
}

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

/* GET with ETag/304 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const env = getEnvOrError(); if ("error" in env) return env.error;
  const kv = env.env.KAVA_TOURNAMENTS;

  const id = params.id || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const v = await getV(kv, id);
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

    const raw = await kv.get(LKEY(id));
    if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(raw, {
      headers: {
        "content-type": "application/json",
        ETag: etag,
        "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
        "x-l-version": String(v),
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: "GET failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

/* PUT with If-Match */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const env = getEnvOrError(); if ("error" in env) return env.error;
  const kv = env.env.KAVA_TOURNAMENTS;

  const id = params.id || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const ifMatch = req.headers.get("if-match");
    const curV = await getV(kv, id);
    if (ifMatch !== null && String(curV) !== String(ifMatch)) {
      return NextResponse.json({ error: "Version conflict" }, { status: 412 });
    }

    const prevRaw = await kv.get(LKEY(id));
    const prev = prevRaw ? coerce(JSON.parse(prevRaw)) : null;
    const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));

    let body: ListGame;
    try { body = coerce(await req.json()); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
    if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

    await kv.put(LKEY(id), JSON.stringify(body));
    const nextV = curV + 1;
    await setV(kv, id, nextV);

    const nextPlayers = new Set((body.players ?? []).map(p => p.id));
    for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(kv, LPLAYER(p), id);
    for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(kv, LPLAYER(p), id);

    if (prev?.hostId && prev.hostId !== body.hostId) {
      await removeFrom(kv, LHOST(prev.hostId), id);
    }
    if (body.hostId) await addTo(kv, LHOST(body.hostId), id);

    return new NextResponse(null, { status: 204, headers: { "x-l-version": String(nextV), ETag: `"l-${nextV}"` } });
  } catch (e: any) {
    return NextResponse.json({ error: "PUT failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

/* DELETE */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const env = getEnvOrError(); if ("error" in env) return env.error;
  const kv = env.env.KAVA_TOURNAMENTS;

  const id = params.id || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const raw = await kv.get(LKEY(id));
    if (raw) {
      try {
        const doc = coerce(JSON.parse(raw));
        if (doc.code) await kv.delete(`code:${doc.code}`);
        for (const p of (doc.players || [])) await removeFrom(kv, LPLAYER(p.id), id);
        if (doc.hostId) await removeFrom(kv, LHOST(doc.hostId), id);
      } catch {}
    }

    await kv.delete(LKEY(id));
    await kv.delete(LVER(id));
    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    return NextResponse.json({ error: "DELETE failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
