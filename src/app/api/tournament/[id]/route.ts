// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getEnvOrError, KVNamespace } from "../../_utils/env";

type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type TournamentStatus = "setup" | "active" | "completed";
type Tournament = {
  id: string; name: string; code?: string; hostId: string; status: TournamentStatus;
  createdAt: number; players: Player[]; pending: Player[]; queue: string[]; rounds: Match[][];
  v?: number; coHosts?: string[];
};

const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;
const PIDX = (playerId: string) => `tidx:p:${playerId}`;

async function getV(kv: KVNamespace, id: string): Promise<number> {
  const raw = await kv.get(TVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(kv: KVNamespace, id: string, v: number) {
  await kv.put(TVER(id), String(v));
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

/* GET with ETag/304 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const env = getEnvOrError(); if ("error" in env) return env.error;
  const kv = env.env.KAVA_TOURNAMENTS;

  const id = params.id || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const v = await getV(kv, id);
    const etag = `"t-${v}"`;
    const inm = req.headers.get("if-none-match");
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
          "x-t-version": String(v),
        }
      });
    }

    const raw = await kv.get(TKEY(id));
    if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(raw, {
      headers: {
        "content-type": "application/json",
        ETag: etag,
        "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
        "x-t-version": String(v),
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

    const prevRaw = await kv.get(TKEY(id));
    const prev: Tournament | null = prevRaw ? JSON.parse(prevRaw) : null;
    const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));

    let body: Tournament;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
    if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

    await kv.put(TKEY(id), JSON.stringify(body));
    const nextV = curV + 1;
    await setV(kv, id, nextV);

    const nextPlayers = new Set((body.players ?? []).map(p => p.id));
    for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(kv, PIDX(p), id);
    for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(kv, PIDX(p), id);

    return new NextResponse(null, { status: 204, headers: { "x-t-version": String(nextV), ETag: `"t-${nextV}"` } });
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
    const raw = await kv.get(TKEY(id));
    if (raw) {
      try {
        const doc = JSON.parse(raw) as Tournament;
        if (doc.players) {
          for (const p of doc.players) await removeFrom(kv, PIDX(p.id), id);
        }
        if (doc.code) await kv.delete(`code:${doc.code}`);
      } catch {}
    }
    await kv.delete(TKEY(id));
    await kv.delete(TVER(id));
    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    return NextResponse.json({ error: "DELETE failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
