// src/app/api/tournaments/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import type { Tournament } from "@/lib/storage";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: {
    list: (opts: { prefix: string; limit?: number; cursor?: string }) => Promise<{
      keys: { name: string }[];
      list_complete: boolean;
      cursor?: string;
    }>;
    get: (key: string) => Promise<string | null>;
  };
};

/**
 * GET /api/tournaments
 * - ?hostId=abc       -> all tournaments where hostId === abc
 * - ?userId=abc       -> { hosting: [...], playing: [...] }
 */
export async function GET(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;
  const userId = url.searchParams.get("userId") || undefined;

  // paginate through t: keys
  let cursor: string | undefined = undefined;
  const ids: string[] = [];
  do {
    const { keys, cursor: next } = await env.KAVA_TOURNAMENTS.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    });
    ids.push(...keys.map(k => k.name.replace(/^t:/, "")));
    cursor = next;
  } while (cursor);

  // fetch tournaments
  const tournaments: Tournament[] = [];
  for (const id of ids) {
    const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
    if (!raw) continue;
    try {
      tournaments.push(JSON.parse(raw) as Tournament);
    } catch { /* skip bad rows */ }
  }

  // filter shapes
  if (hostId) {
    const hosting = tournaments.filter(t => t.hostId === hostId);
    return NextResponse.json(hosting, { headers: { "cache-control": "no-store" } });
  }

  if (userId) {
    const hosting = tournaments.filter(t => t.hostId === userId);
    const playing = tournaments.filter(t =>
      (t.players || []).some(p => p.id === userId) ||
      (t.pending || []).some(p => p.id === userId)
    );
    return NextResponse.json({ hosting, playing }, { headers: { "cache-control": "no-store" } });
  }

  // default: everything (admin-ish)
  return NextResponse.json(tournaments, { headers: { "cache-control": "no-store" } });
}
