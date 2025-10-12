// src/app/api/tournaments/route.ts
export const runtime = "edge";
import { NextResponse } from "next/server";
import { getEnv } from "../_kv";

type Tournament = {
  id: string; hostId: string; players: { id: string; name: string }[];
  createdAt: number; updatedAt: number; name: string; code?: string;
};

export async function GET(req: Request) {
  const env = getEnv();
  const u = new URL(req.url);
  const userId = u.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  if (!env.KAVA_TOURNAMENTS) {
    return NextResponse.json({ error: "KV binding KAVA_TOURNAMENTS is not available" }, { status: 500 });
  }

  let cursor: string | undefined = undefined;
  const hosting: Tournament[] = [];
  const playing: Tournament[] = [];

  while (true) {
    const res = await env.KAVA_TOURNAMENTS.list({ prefix: "t:", limit: 1000, cursor });
    for (const k of res.keys) {
      const raw = await env.KAVA_TOURNAMENTS.get(k.name);
      if (!raw) continue;
      const t = JSON.parse(raw) as Tournament;
      if (t.hostId === userId) hosting.push(t);
      else if ((t.players || []).some(p => p.id === userId)) playing.push(t);
    }
    if (!res.list_complete && res.cursor) { cursor = res.cursor; }
    else break;
  }

  const byCreated = (a: Tournament, b: Tournament) => (b.createdAt || 0) - (a.createdAt || 0);
  hosting.sort(byCreated);
  playing.sort(byCreated);

  const listVersion = Math.max(
    0,
    ...hosting.map(t => t.updatedAt || 0),
    ...playing.map(t => t.updatedAt || 0)
  );

  return NextResponse.json({ hosting, playing, listVersion });
}
