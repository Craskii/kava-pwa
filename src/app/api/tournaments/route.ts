// src/app/api/tournaments/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

// Minimal types for KV list() response so we don't use `any`
type KVListKey = { name: string; expiration?: number; metadata?: unknown };
type KVListResult = { keys: KVListKey[]; list_complete: boolean; cursor?: string };

// If you want stricter typing for what you store:
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

export async function GET(req: Request, _ctx: { params: {} }) {
  const { env } = getRequestContext<{ env: Env }>();

  const url = new URL(req.url);
  const hostId = url.searchParams.get("hostId") || undefined;

  // ---- collect all tournament ids from KV (keys are "t:<id>") ----
  const ids: string[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    // Cast via `unknown` -> our local interface to avoid `any`
    const res = (await env.KAVA_TOURNAMENTS.list({
      prefix: "t:",
      limit: 1000,
      cursor,
    } as unknown)) as unknown as KVListResult;

    ids.push(...res.keys.map((k) => k.name.slice(2)));

    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }

  // ---- load tournaments and optionally filter by hostId ----
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

  // Sort newest first (supports number or ISO string)
  filtered.sort((a, b) => {
    const aT = Number(a.createdAt) || Date.parse(String(a.createdAt));
    const bT = Number(b.createdAt) || Date.parse(String(b.createdAt));
    return bT - aT;
  });

  return NextResponse.json(filtered);
}
