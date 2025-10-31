// src/app/api/join/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Player = { id: string; name: string };
type Pref = "8 foot" | "9 foot" | "any";

type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active"; createdAt: number;
  tables: { a?: string; b?: string; label: "8 foot"|"9 foot" }[];
  players: Player[];
  queue8: string[];
  queue9: string[];
  prefs?: Record<string, Pref>;
  v?: number;
};

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const CODEKEY = (code: string) => `code:${code}`;

function coerceIn(doc: any): ListGame {
  const players: Player[] = Array.isArray(doc?.players)
    ? doc.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") }))
    : [];
  const tables = Array.isArray(doc?.tables)
    ? doc.tables.map((t: any, i: number) => ({
      a: t?.a ? String(t.a) : undefined,
      b: t?.b ? String(t.b) : undefined,
      label: (t?.label === "9 foot" || t?.label === "8 foot") ? t.label : (i===1?"9 foot":"8 foot")
    }))
    : [{label:"8 foot"},{label:"9 foot"}];
  const prefs: Record<string, Pref> = {};
  if (doc?.prefs && typeof doc.prefs === "object") {
    for (const [pid, v] of Object.entries(doc.prefs)) {
      prefs[String(pid)] = (v === "8 foot" || v === "9 foot" || v === "any") ? (v as Pref) : "any";
    }
  }
  return {
    id: String(doc?.id ?? ""),
    name: String(doc?.name ?? "Untitled"),
    code: doc?.code ? String(doc.code) : undefined,
    hostId: String(doc?.hostId ?? ""),
    status: "active",
    createdAt: Number(doc?.createdAt ?? Date.now()),
    tables,
    players,
    queue8: (doc?.queue8 ?? []).map((x: any)=>String(x)).filter(Boolean),
    queue9: (doc?.queue9 ?? []).map((x: any)=>String(x)).filter(Boolean),
    prefs,
    v: Number.isFinite(doc?.v) ? Number(doc.v) : undefined,
  };
}

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  let payload: { code: string; player: Player } | null = null;
  try { payload = await req.json(); } catch {}
  if (!payload || !payload.code || !payload.player?.id || !payload.player?.name) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const id = await env.KAVA_TOURNAMENTS.get(CODEKEY(payload.code));
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = coerceIn(JSON.parse(raw));
  // add player if missing; default pref any; enqueue them at tail (single combined queue policy: 9ft first)
  if (!doc.players.some(p => p.id === payload!.player.id)) {
    doc.players.push({ id: payload.player.id, name: payload.player.name });
    doc.prefs ??= {};
    doc.prefs[payload.player.id] = "any";
    // default to 8ft queue to avoid 9ft starvation policy (your call)
    doc.queue8.push(payload.player.id);
  }
  const nextV = (Number(doc.v)||0) + 1; doc.v = nextV;

  await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(doc));
  await env.KAVA_TOURNAMENTS.put(LVER(id), String(nextV));

  return NextResponse.json({ id }); // client should navigate to /list/:id
}
