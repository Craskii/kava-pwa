// src/app/api/tournaments/route.ts
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

type KVListKey = { name: string };
type KVListResult = { keys: KVListKey[]; list_complete: boolean; cursor?: string };

function ts(x: number | string) {
  return typeof x === "number" ? x : Date.parse(String(x));
}

export async function GET(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;
  const userId = url.searchParams.get("userId") || undefined;

  // gather all ids via pagination
  const ids: string[] = [];
  let cursor: string | undefined;
  while (true) {
    const res = (await env.KAVA_TOURNAMENTS.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    } as unknown)) as unknown as KVListResult;

    ids.push(...res.keys.map(k => k.name.slice(2)));
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }

  // load docs
  const tournaments = (
    await Promise.all(
      ids.map(async (id) => {
        const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
        if (!raw) return null;
        try { return JSON.parse(raw) as Tournament; } catch { return null; }
      })
    )
  ).filter((x): x is Tournament => Boolean(x));

  // sort newest first
  tournaments.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

  if (hostId) {
    const hosting = tournaments.filter(t => String(t.hostId) === hostId);
    return NextResponse.json(hosting);
  }

  if (userId) {
    const hosting = tournaments.filter(t => String(t.hostId) === userId);
    const playing = tournaments.filter(t =>
      (t.players || []).some(p => p.id === userId) && String(t.hostId) !== userId
    );
    return NextResponse.json({ hosting, playing });
  }

  // fallback: return everything (useful for admin/testing)
  return NextResponse.json(tournaments);
}
