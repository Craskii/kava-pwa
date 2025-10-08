// src/app/api/join/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KV };

type Player = { id: string; name: string };
type Match = {
  a?: string;
  b?: string;
  winner?: string;
  reports?: Record<string, "win" | "loss" | undefined>;
};
type Tournament = {
  id: string;
  code: string;
  name: string;
  hostId: string;
  status: "setup" | "active" | "completed";
  createdAt: number;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const body = (await req.json().catch(() => null)) as
    | { code?: string; player?: Player }
    | null;

  const rawCode = body?.code || "";
  const safeCode = rawCode.trim().toUpperCase();
  const player = body?.player;

  if (!safeCode || !player?.id || !player?.name) {
    return NextResponse.json(
      { error: "Missing code or player" },
      { status: 400 }
    );
  }

  const id = await kv.get(`code:${safeCode}`);
  if (!id) {
    return NextResponse.json(
      { error: "No tournament with that code." },
      { status: 404 }
    );
  }

  const json = await kv.get(`t:${id}`);
  if (!json) {
    return NextResponse.json({ error: "Tournament missing." }, { status: 404 });
  }
  const t = JSON.parse(json) as Tournament;

  // Don’t duplicate
  const alreadyIn =
    t.players.some((p) => p.id === player.id) ||
    t.pending.some((p) => p.id === player.id);

  if (!alreadyIn) {
    if (t.status === "active") {
      // while active: put into pending; host can approve to place them
      t.pending.push(player);
    } else {
      // setup phase
      t.players.push(player);
    }
    await kv.put(`t:${id}`, JSON.stringify(t));
  }

  return NextResponse.json({ ok: true, id: t.id, tournament: t });
}
