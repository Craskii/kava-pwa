export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- KV ---------- */
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* ---------- Types ---------- */
type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type TournamentStatus = "setup" | "active" | "completed";
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: TournamentStatus;
  createdAt: number;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
  v?: number;
};

/* ---------- version helpers ---------- */
const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;

async function getV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(TVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(TVER(id), String(v));
}

/* ---------- GET ---------- */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;
  const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = JSON.parse(raw) as Tournament;
  const v = await getV(env, id);
  return NextResponse.json(doc, { headers: { "x-t-version": String(v) } });
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

  let body: Tournament;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  await env.KAVA_TOURNAMENTS.put(TKEY(id), JSON.stringify(body));
  const nextV = curV + 1;
  await setV(env, id, nextV);
  return new NextResponse(null, { status: 204, headers: { "x-t-version": String(nextV) } });
}

/* ---------- DELETE ---------- */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (raw) {
    try { const doc = JSON.parse(raw) as Tournament; if (doc.code) await env.KAVA_TOURNAMENTS.delete(`code:${doc.code}`); } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(TKEY(id));
  await env.KAVA_TOURNAMENTS.delete(TVER(id));
  return new NextResponse(null, { status: 204 });
}
