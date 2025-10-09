export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* KV */
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* Types */
type Player = { id: string; name: string };
type Report = "win" | "loss" | undefined;
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string, Report> };
type TournamentStatus = "setup" | "active" | "completed";
type Tournament = {
  id: string; name: string; code?: string; hostId: string; status: TournamentStatus;
  createdAt: number; players: Player[]; pending: Player[]; queue: string[]; rounds: Match[][];
};
type Table = { a?: string; b?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active";
  createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};

type CreateBody = { name?: string; hostId?: string; type?: "tournament" | "list" };

/* helpers */
function random5(): string { return Math.floor(Math.random() * 100000).toString().padStart(5, "0"); }
async function uniqueNumericCode(env: Env): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const c = random5();
    const exists = await env.KAVA_TOURNAMENTS.get(`code:${c}`);
    if (!exists) return c;
  }
  return random5();
}

/* route */
export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: CreateBody = {};
  try { body = await req.json(); } catch {}

  const name = (body.name ?? "Untitled").toString();
  const hostId = (body.hostId ?? crypto.randomUUID()).toString();
  const type: "tournament" | "list" = body.type ?? "tournament";

  const id = crypto.randomUUID();
  const code = await uniqueNumericCode(env);

  if (type === "list") {
    const listDoc: ListGame = {
      id, code, name, hostId, status: "active", createdAt: Date.now(),
      tables: [{}, {}], players: [], queue: [],
    };
    await env.KAVA_TOURNAMENTS.put(`l:${id}`, JSON.stringify(listDoc));
    await env.KAVA_TOURNAMENTS.put(`code:${code}`, JSON.stringify({ type: "list", id }));
    return NextResponse.json({ ok: true, id, code, type: "list" });
  }

  const tournament: Tournament = {
    id, code, name, hostId, status: "setup", createdAt: Date.now(),
    players: [], pending: [], queue: [], rounds: [],
  };

  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(tournament));
  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id); // legacy
  await env.KAVA_TOURNAMENTS.put(`code2:${code}`, JSON.stringify({ type: "tournament", id }));

  return NextResponse.json({ ok: true, id, code, type: "tournament" });
}
