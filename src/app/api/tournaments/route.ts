// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type Env = { KAVA_TOURNAMENTS: KVNamespace };
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "setup" | "active" | "completed";
  createdAt: number | string;
  players: { id: string; name: string }[];
  pending: { id: string; name: string }[];
  queue: string[];
  rounds: any[][];
};

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;
  const userId = url.searchParams.get("userId") || undefined;

  // Collect all tournament ids via KV list with pagination
  const ids: string[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const res = (await env.KAVA_TOURNAMENTS.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    })) as unknown as { keys: { name: string }[]; cursor?: string; list_complete?: boolean };

    for (const k of res.keys) {
      const id = k.name.replace(/^t:/, "");
      ids.push(id);
    }

    if (!res.cursor || res.list_complete) break;
    cursor = res.cursor;
  }

  // Fetch tournaments (can parallelize)
  const all = await Promise.all(
    ids.map(async (id) => {
      const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
      return json ? (JSON.parse(json) as Tournament) : null;
    })
  );
  const tournaments = all.filter((t): t is Tournament => !!t);

  // Sort newest first
  tournaments.sort((a, b) => {
    const ta = Number(a.createdAt) || Date.parse(String(a.createdAt));
    const tb = Number(b.createdAt) || Date.parse(String(b.createdAt));
    return tb - ta;
  });

  if (userId) {
    const hosting = tournaments.filter((t) => t.hostId === userId);
    const playing = tournaments.filter(
      (t) => (t.players || []).some((p) => p.id === userId)
          || (t.pending || []).some((p) => p.id === userId)
    );
    return NextResponse.json({ hosting, playing });
  }

  if (hostId) {
    return NextResponse.json(tournaments.filter((t) => t.hostId === hostId));
  }

  return NextResponse.json(tournaments);
}
