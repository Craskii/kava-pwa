// src/app/api/tournaments/route.ts
import { NextResponse } from "next/server";
import { getRequestContext, type CloudflareEnv } from "@cloudflare/next-on-pages";

export const runtime = "edge";

// Tell TS that our Cloudflare env ALSO includes this KV binding name.
type Bindings = CloudflareEnv & { KAVA_TOURNAMENTS: KVNamespace };

// Minimal types for KV list() response
type KVListKey = { name: string; expiration?: number; metadata?: unknown };
type KVListResult = { keys: KVListKey[]; list_complete: boolean; cursor?: string };

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
  // Cast the env to include our KV binding so TS is happy
  const { env } = getRequestContext<{ env: Bindings }>();

  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;

  // Collect all tournament ids from KV (keys are "t:<id>")
  const ids: string[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const res = (await env.KAVA_TOURNAMENTS.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    } as unknown)) as unknown as KVListResult;

    ids.push(...res.keys.map((k) => k.name.slice(2)));

    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }

  // Load tournaments
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

  const filtered = hostId
    ? tournaments.filter((t) => String(t.hostId) === hostId)
    : tournaments;

  // Sort newest first
  filtered.sort((a, b) => {
    const aT = Number(a.createdAt) || Date.parse(String(a.createdAt));
    const bT = Number(b.createdAt) || Date.parse(String(b.createdAt));
    return bT - aT;
  });

  return NextResponse.json(filtered);
}
