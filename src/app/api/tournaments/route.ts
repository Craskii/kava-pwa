// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};

type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type TournamentStatus = "setup" | "active" | "completed";
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: TournamentStatus;
  createdAt: number | string;
  players: Player[];
  pending: Player[];
  queue: string[];
  rounds: Match[][];
};

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;
  const userId = url.searchParams.get("userId") || undefined;

  // page through KV keys under t:
  const ids: string[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const res = await env.KAVA_TOURNAMENTS.list({ prefix: "t:", limit: 1000, cursor });
    for (const k of res.keys) ids.push(k.name.replace(/^t:/, ""));
    if (!res.cursor || res.list_complete) break;
    cursor = res.cursor;
  }

  // fetch all tournaments
  const all = await Promise.all(
    ids.map(async (id) => {
      const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
      return json ? (JSON.parse(json) as Tournament) : null;
    })
  );

  const tournaments: Tournament[] = all.filter((t): t is Tournament => t !== null);

  // newest first
  tournaments.sort((a, b) => {
    const ta = Number(a.createdAt) || Date.parse(String(a.createdAt));
    const tb = Number(b.createdAt) || Date.parse(String(b.createdAt));
    return tb - ta;
  });

  if (userId) {
    const hosting = tournaments.filter((t) => t.hostId === userId);
    const playing = tournaments.filter(
      (t) => (t.players ?? []).some((p) => p.id === userId) || (t.pending ?? []).some((p) => p.id === userId)
    );
    return NextResponse.json({ hosting, playing });
  }

  if (hostId) {
    return NextResponse.json(tournaments.filter((t) => t.hostId === hostId));
  }

  return NextResponse.json(tournaments);
}
