// src/app/api/join/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* KV + data types (same as create route) */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type Tournament = {
  id: string; name: string; code?: string; hostId: string;
  status: "setup" | "active" | "completed";
  createdAt: number;
  players: Player[]; pending: Player[]; queue: string[]; rounds: Match[][];
};

type JoinBody = { code?: string; player?: Player };

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: JoinBody = {};
  try { body = await req.json(); } catch {}

  const code = (body.code ?? "").toString().replace(/[^0-9]/g, "");
  if (code.length !== 5) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  const player = body.player;
  if (!player?.id || !player?.name) {
    return NextResponse.json({ error: "Missing player" }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const t = JSON.parse(raw) as Tournament;

  // If already a player or pending, do nothing (idempotent)
  const already =
    t.players.some(p => p.id === player.id) || (t.pending ?? []).some(p => p.id === player.id);

  if (!already) {
    t.pending = [...(t.pending ?? []), { id: player.id, name: player.name }];
    await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(t));
  }

  return NextResponse.json({ ok: true, id });
}
