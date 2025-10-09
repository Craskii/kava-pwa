// src/app/api/join/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- Cloudflare KV types ---------- */
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* ---------- shared types ---------- */
type Player = { id: string; name: string };

type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "setup" | "active" | "completed";
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

type JoinBody = { code?: string; player?: Player };

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: JoinBody = {};
  try { body = await req.json(); } catch {}
  const code = (body.code ?? "").toString();
  const player = body.player;

  if (!code || !player?.id || !player?.name) {
    return NextResponse.json({ error: "Missing code or player" }, { status: 400 });
  }

  // 1) Try primary mapping
  let mappingRaw = await env.KAVA_TOURNAMENTS.get(`code:${code}`);

  // 2) If not found, try code2 (new JSON style)
  if (!mappingRaw) {
    mappingRaw = await env.KAVA_TOURNAMENTS.get(`code2:${code}`);
  }

  if (!mappingRaw) {
    return NextResponse.json({ error: "Invalid code" }, { status: 404 });
  }

  // Determine mapping type:
  let type: "tournament" | "list" = "tournament";
  let id = mappingRaw;

  // If JSON, parse { type, id }
  try {
    const parsed = JSON.parse(mappingRaw) as { type?: "tournament" | "list"; id?: string };
    if (parsed?.id) {
      id = parsed.id;
      if (parsed.type === "list") type = "list";
      else type = "tournament";
    }
  } catch {
    // mappingRaw was a plain string id → legacy tournament
    type = "tournament";
  }

  if (type === "tournament") {
    const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
    if (!raw) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    const t = JSON.parse(raw) as Tournament;

    // If player not already present (players/pending), add to pending
    const already =
      t.players.some(p => p.id === player.id) || t.pending.some(p => p.id === player.id);
    if (!already) {
      t.pending.push({ id: player.id, name: player.name });
      await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(t));
    }

    return NextResponse.json({ ok: true, type: "tournament", id });
  }

  // type === "list"
  const lraw = await env.KAVA_TOURNAMENTS.get(`l:${id}`);
  if (!lraw) return NextResponse.json({ error: "List room not found" }, { status: 404 });

  const g = JSON.parse(lraw) as ListGame;

  // Ensure on roster
  if (!g.players.find(p => p.id === player.id)) {
    g.players.push({ id: player.id, name: player.name });
  }

  // If not in any table or queue, add to queue
  const sitting =
    g.tables.some(tb => tb.a === player.id || tb.b === player.id) || g.queue.includes(player.id);
  if (!sitting) g.queue.push(player.id);

  await env.KAVA_TOURNAMENTS.put(`l:${id}`, JSON.stringify(g));

  return NextResponse.json({ ok: true, type: "list", id });
}
