// src/app/api/join/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type Env = { KAVA_TOURNAMENTS: KVNamespace };
type Player = { id: string; name: string };
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "setup" | "active" | "completed";
  createdAt: number | string;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: any[][];
};

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const body = await req.json().catch(() => null as any);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const code = (body.code ?? "").toString().trim().toUpperCase();
  const player: Player | null = body.player && body.player.id ? { id: String(body.player.id), name: String(body.player.name || "Guest") } : null;

  if (!code || !player) {
    return NextResponse.json({ error: "Missing code or player" }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return NextResponse.json({ error: "No tournament with that code." }, { status: 404 });

  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!json) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const t = JSON.parse(json) as Tournament;

  // Already in players or pending? no-op success
  if (t.players.some((p) => p.id === player.id) || t.pending.some((p) => p.id === player.id)) {
    return NextResponse.json({ ok: true, id: t.id });
  }

  // If tournament is active, late-join goes to pending (host will approve -> insertLatePlayer)
  // If setup, pending also (host approves into players)
  t.pending = [...(t.pending || []), player];

  await env.KAVA_TOURNAMENTS.put(`t:${t.id}`, JSON.stringify(t));
  return NextResponse.json({ ok: true, id: t.id });
}
