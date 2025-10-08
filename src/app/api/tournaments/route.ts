// src/app/api/tournaments/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// --- Minimal env typing: only what we actually use ---
type Env = { KAVA_TOURNAMENTS: KVNamespace };

// KV list() response shape
type KVListKey = { name: string; expiration?: number; metadata?: unknown };
type KVListResult = {
  keys: KVListKey[];
  list_complete: boolean;
  cursor?: string;
};

// Tournament shape (kept loose for this endpoint)
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "setup" | "active" | "completed";
  createdAt: number | string;
  players: Array<{ id: string; name: string }>;
  pending: Array<{ id: string; name: string }>;
  queue: string[];
  rounds: unknown[][];
};

export async function GET(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();

  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;

  // 1) Collect all tournament ids via KV pagination
  const ids: string[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // TS for Workers KV list() is a bit loose; cast to our local type
    const res = (await env.KAVA_TOURNAMENTS.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    } as unknown)) as unknown as KVListResult;

    ids.push(...res.keys.map((k) => k.name.slice(2)));
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }

  // 2) Load and parse each tournament
  const tournaments = (
    await Promise.all(
      ids.map(async (id) => {
        const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
        if (!raw) return null;
        try {
          return JSON.parse(raw) as Tournament;
        } catch {
          return null;
        }
      })
    )
  ).filter((x): x is Tournament => Boolean(x));

  // 3) Optional filter by host
  const filtered = hostId
    ? tournaments.filter((t) => String(t.hostId) === hostId)
    : tournaments;

  // 4) Sort newest first
  filtered.sort((a, b) => {
    const aT = Number(a.createdAt) || Date.parse(String(a.createdAt));
    const bT = Number(b.createdAt) || Date.parse(String(b.createdAt));
    return bT - aT;
  });

  return NextResponse.json(filtered);
}
