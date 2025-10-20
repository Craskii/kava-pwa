// src/app/api/create/route.ts 
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* KV & types */
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

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
};
type Table = { a?: string; b?: string };
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];
};

type CreateBody = { name?: string; hostId?: string; type?: "tournament" | "list" };

/* KV keys */
const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;
const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`; // string[]
const LHOST = (hostId: string) => `lidx:h:${hostId}`; // string[]

/* helpers */
function random5(): string {
  return Math.floor(Math.random() * 100000).toString().padStart(5, "0");
}
async function uniqueNumericCode(env: Env): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const c = random5();
    const exists = await env.KAVA_TOURNAMENTS.get(`code:${c}`);
    if (!exists) return c;
  }
  return random5();
}
async function pushId(env: Env, key: string, id: string) {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  let arr: string[];
  try { arr = JSON.parse(raw); } catch { arr = []; }
  if (!arr.includes(id)) {
    arr.unshift(id);
    await env.KAVA_TOURNAMENTS.put(key, JSON.stringify(arr.slice(0, 500)));
  }
}
async function bumpVersion(env: Env, key: string) {
  const cur = await env.KAVA_TOURNAMENTS.get(key);
  const n = cur ? Number(cur) || 0 : 0;
  await env.KAVA_TOURNAMENTS.put(key, String(n + 1));
}

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: CreateBody = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type: "tournament" | "list" = body.type ?? "tournament";
  const name = (body.name ?? "Untitled").toString().trim() || "Untitled";
  const hostId = (body.hostId || "").toString().trim();

  if (!hostId) {
    // Don’t crash the UI; tell the client exactly what’s wrong.
    return NextResponse.json({ error: "Missing hostId" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const code = await uniqueNumericCode(env);
  const now = Date.now();

  if (type === "list") {
    const listDoc: ListGame = {
      id, code, name, hostId,
      status: "active",
      createdAt: now,
      tables: [{}, {}],
      players: [],
      queue: [],
    };
    await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(listDoc));
    await env.KAVA_TOURNAMENTS.put(LVER(id), "1");
    await env.KAVA_TOURNAMENTS.put(`code:${code}`, JSON.stringify({ type: "list", id }));
    await pushId(env, LHOST(hostId), id);
    await bumpVersion(env, LVER(id));
    return NextResponse.json({ ok: true, id, code, hostId, type: "list", href: `/list/${encodeURIComponent(id)}` }, { status: 201 });
  }

  const tournament: Tournament = {
    id, code, name, hostId,
    status: "setup",
    createdAt: now,
    players: [],
    pending: [],
    queue: [],
    rounds: [],
  };

  await env.KAVA_TOURNAMENTS.put(TKEY(id), JSON.stringify(tournament));
  await env.KAVA_TOURNAMENTS.put(TVER(id), "1");
  await env.KAVA_TOURNAMENTS.put(`code:${code}`, JSON.stringify({ type: "tournament", id }));
  await pushId(env, THOST(hostId), id);
  await bumpVersion(env, TVER(id));

  return NextResponse.json({ ok: true, id, code, hostId, type: "tournament", href: `/t/${encodeURIComponent(id)}` }, { status: 201 });
}
