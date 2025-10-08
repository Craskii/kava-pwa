// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

// ---- KV typing helpers ----
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

// ---- shared domain types (keep in sync with src/lib/storage.ts) ----
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

function extractIdFromPath(url: string): string {
  const path = new URL(url).pathname; // e.g. /api/tournament/abc-123
  return decodeURIComponent(path.split("/").pop() || "").trim();
}

// GET → fetch tournament by id
export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = extractIdFromPath(req.url);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!json) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(JSON.parse(json) as Tournament);
}

// PUT → upsert full tournament (id must match path)
export async function PUT(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = extractIdFromPath(req.url);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!bodyUnknown || typeof bodyUnknown !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const t = bodyUnknown as Tournament;
  if (!t?.id || t.id !== id) {
    return NextResponse.json({ error: "Body.id must match path id" }, { status: 400 });
  }

  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(t));
  return new NextResponse(null, { status: 204 });
}

// DELETE → delete tournament and its code mapping (if present)
export async function DELETE(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = extractIdFromPath(req.url);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (existing) {
    const t = JSON.parse(existing) as Tournament;
    if (t.code) {
      await env.KAVA_TOURNAMENTS.delete(`code:${String(t.code).toUpperCase()}`);
    }
  }

  await env.KAVA_TOURNAMENTS.delete(`t:${id}`);
  return new NextResponse(null, { status: 204 });
}
