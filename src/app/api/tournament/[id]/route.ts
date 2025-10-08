// src/app/api/tournament/[id]/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
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
  createdAt: number | string;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

async function readTournament(kv: KV, id: string) {
  const json = await kv.get(`t:${id}`);
  return json ? (JSON.parse(json) as Tournament) : null;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const { id } = await context.params;
  const t = await readTournament(kv, id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as Tournament | null;
  if (!body || body.id !== id)
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  // ensure code->id mapping is consistent (in case code changes, though your UI doesn’t)
  if (body.code) {
    await kv.put(`code:${body.code.toString().toUpperCase()}`, id);
  }

  await kv.put(`t:${id}`, JSON.stringify(body));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const { id } = await context.params;
  const t = await readTournament(kv, id);
  if (!t) return NextResponse.json({ ok: true }); // idempotent

  if (t.code) {
    await kv.delete(`code:${t.code.toString().toUpperCase()}`);
  }
  await kv.delete(`t:${id}`);
  return NextResponse.json({ ok: true });
}
