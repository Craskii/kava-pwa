// src/app/api/tournaments/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type KV = {
  get(key: string): Promise<string | null>;
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
  createdAt: number | string;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

async function listAllTournamentIds(kv: KV) {
  const ids: string[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const res = await kv.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    });
    for (const k of res.keys) {
      const id = k.name.slice(2); // strip "t:"
      if (id) ids.push(id);
    }
    if (!res.cursor || res.list_complete) break;
    cursor = res.cursor;
  }
  return ids;
}

export async function GET(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;
  const userId = url.searchParams.get("userId") || undefined;

  const ids = await listAllTournamentIds(kv);

  // We stream GETs for each tournament in parallel, then filter/sort in memory.
  const tournaments = (await Promise.all(
    ids.map(async (id) => {
      const json = await kv.get(`t:${id}`);
      return json ? (JSON.parse(json) as Tournament) : null;
    })
  )).filter(Boolean) as Tournament[];

  let result = tournaments;

  if (hostId) {
    result = result.filter((t) => t.hostId === hostId);
  } else if (userId) {
    result = result.filter(
      (t) =>
        (t.players || []).some((p) => p.id === userId) ||
        (t.pending || []).some((p) => p.id === userId)
    );
  }

  result.sort((a, b) => {
    const ta = typeof a.createdAt === "number" ? a.createdAt : Date.parse(String(a.createdAt));
    const tb = typeof b.createdAt === "number" ? b.createdAt : Date.parse(String(b.createdAt));
    return tb - ta; // newest first
  });

  return NextResponse.json(result);
}
