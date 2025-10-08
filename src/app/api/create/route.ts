// src/app/api/create/route.ts
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

type CreateBody = { name?: string; hostId?: string };

function random4Digits(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    bodyUnknown = null;
  }

  const body = (bodyUnknown && typeof bodyUnknown === "object" ? (bodyUnknown as CreateBody) : {}) ?? {};
  const name = (body.name ?? "Untitled Tournament").toString();
  const hostId = (body.hostId ?? crypto.randomUUID()).toString();

  const id = crypto.randomUUID();
  const code = random4Digits();

  const tournament: Tournament = {
    id,
    code,
    name,
    hostId,
    status: "setup",
    createdAt: Date.now(),
    players: [],
    pending: [],
    queue: [],
    rounds: [],
  };

  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(tournament));

  return NextResponse.json({ ok: true, id, code, tournament });
}
