// src/app/api/join/route.ts
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

type JoinBody = { code?: string; player?: { id?: string; name?: string } };

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  // safely parse JSON without any
  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    bodyUnknown = null;
  }

  const obj = (bodyUnknown && typeof bodyUnknown === "object" ? (bodyUnknown as JoinBody) : {}) ?? {};
  const rawCode = (obj.code ?? "").toString().trim().toUpperCase();
  const incomingPlayer = obj.player ?? {};
  const player: Player | null =
    incomingPlayer?.id ? { id: String(incomingPlayer.id), name: String(incomingPlayer.name ?? "Guest") } : null;

  if (!rawCode || !player) {
    return NextResponse.json({ error: "Missing code or player" }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${rawCode}`);
  if (!id) return NextResponse.json({ error: "No tournament with that code." }, { status: 404 });

  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!json) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const t = JSON.parse(json) as Tournament;

  // If already present, succeed quietly
  const alreadyIn =
    (t.players ?? []).some((p) => p.id === player.id) || (t.pending ?? []).some((p) => p.id === player.id);
  if (alreadyIn) return NextResponse.json({ ok: true, id: t.id });

  // Add to pending; host can approve in UI
  t.pending = [...(t.pending ?? []), player];

  await env.KAVA_TOURNAMENTS.put(`t:${t.id}`, JSON.stringify(t));
  return NextResponse.json({ ok: true, id: t.id });
}
