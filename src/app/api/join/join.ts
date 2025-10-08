// src/app/api/join/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
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
  rounds: unknown[][];
};

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const body = await req.json().catch(() => null) as { code?: string; player?: Player } | null;
  if (!body?.code || !body.player?.id || !body.player?.name) {
    return NextResponse.json({ error: "Missing code or player" }, { status: 400 });
    }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${body.code}`);
  if (!id) return NextResponse.json({ error: "No tournament with that code." }, { status: 404 });

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!raw) return NextResponse.json({ error: "Tournament missing." }, { status: 404 });

  const t = JSON.parse(raw) as Tournament;

  // if already in players/pending/queue, no-op
  const already =
    (t.players || []).some(p => p.id === body.player!.id) ||
    (t.pending || []).some(p => p.id === body.player!.id) ||
    (t.queue   || []).some(pid => pid === body.player!.id);

  if (!already) {
    t.pending ||= [];
    t.pending.push({ id: body.player.id, name: body.player.name });
    await env.KAVA_TOURNAMENTS.put(`t:${t.id}`, JSON.stringify(t));
  }

  return NextResponse.json({ ok: true, id: t.id });
}
