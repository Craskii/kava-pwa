// src/app/api/create/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

/** Minimal KV type so we don't depend on extra types packages */
type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete?: boolean;
    cursor?: string;
  }>;
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
  createdAt: number; // epoch ms
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

function random4Digits() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function uid() {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const body = (await req.json().catch(() => null)) as
    | { name?: string; hostId?: string }
    | null;

  const name = body?.name?.trim() || "Untitled Tournament";
  const hostId = (body?.hostId || uid()).toString();

  // generate a 4-digit code that isn't taken
  let code: string;
  // in practice collisions are rare; loop guard just in case
  for (let i = 0; i < 20; i++) {
    const cand = random4Digits();
    const existing = await kv.get(`code:${cand}`);
    if (!existing) {
      code = cand;
      break;
    }
  }
  if (!code!) code = random4Digits();

  const id = uid();
  const tournament: Tournament = {
    id,
    code: code!,
    name,
    hostId,
    status: "setup",
    createdAt: Date.now(),
    players: [],
    pending: [],
    queue: [],
    rounds: [],
  };

  // write KV
  await kv.put(`code:${code!}`, id);
  await kv.put(`t:${id}`, JSON.stringify(tournament));

  return NextResponse.json({ ok: true, id, code: code!, tournament });
}
