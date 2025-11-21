// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- KV & keys ---------- */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const TKEY  = (id: string) => `t:${id}`;
const TVER  = (id: string) => `tv:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`; // string[]
const TPLAY = (pid: string)    => `tidx:p:${pid}`;    // string[]

/* ---------- helpers ---------- */
async function readArr(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
async function writeArr(env: Env, key: string, arr: string[]) {
  await env.KAVA_TOURNAMENTS.put(key, JSON.stringify(arr));
}
async function addTo(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  if (!arr.includes(id)) { arr.push(id); await writeArr(env, key, arr); }
}
async function removeFrom(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  const next = arr.filter(x => x !== id);
  if (next.length !== arr.length) await writeArr(env, key, next);
}
async function getV(env: Env, id: string) {
  const raw = await env.KAVA_TOURNAMENTS.get(TVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function bumpV(env: Env, id: string) {
  const cur = await getV(env, id);
  await env.KAVA_TOURNAMENTS.put(TVER(id), String(cur + 1));
}

/* ---------- types + coercion ---------- */
type Player = { id: string; name: string };
type TournamentFormat = "singles" | "doubles" | "groups" | "single_elim";
type TournamentSettings = {
  format: TournamentFormat;
  teamSize: number;
  bracketStyle: "single_elim";
  groups?: {
    count: number;
    size: number;
    matchType?: "singles" | "doubles";
    advancement?: "points" | "wins";
    losersNext?: boolean;
  };
};
type Team = { id: string; name: string; memberIds: string[] };
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string,"win"|"loss"> };
type Tournament = {
  id: string; name: string; code?: string; hostId: string;
  players: Player[]; pending: Player[]; rounds: Match[][];
  status: "setup"|"active"|"completed";
  createdAt: number; updatedAt?: number;
  coHosts?: string[];
  v?: number; // header echo
  teams?: Team[];
  settings?: TournamentSettings;
  groupStage?: { groups: string[][] };
};

function coerceTournament(raw: any): Tournament | null {
  if (!raw) return null;
  try {
    const players: Player[] = Array.isArray(raw.players) ? raw.players.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const pending: Player[] = Array.isArray(raw.pending) ? raw.pending.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const rounds: Match[][] = Array.isArray(raw.rounds)
      ? raw.rounds.map((r:any)=>Array.isArray(r)?r.map((m:any)=>({
          a: m?.a?String(m.a):undefined,
          b: m?.b?String(m.b):undefined,
          winner: m?.winner?String(m.winner):undefined,
          reports: typeof m?.reports==="object" && m?.reports ? m.reports : {},
        })) : [])
      : [];
    const status = (raw.status==="setup"||raw.status==="active"||raw.status==="completed") ? raw.status : "setup";
    const matchType = raw.settings?.groups?.matchType ||
      (raw.settings?.format === "doubles" ? "doubles" : "singles");
    const settings: TournamentSettings = {
      format: (raw.settings?.format as TournamentFormat) || "single_elim",
      teamSize: Number(raw.settings?.teamSize ?? (matchType === "doubles" ? 2 : 1)),
      bracketStyle: (raw.settings?.bracketStyle as TournamentSettings["bracketStyle"]) || "single_elim",
      groups: raw.settings?.format === "groups"
        ? {
            count: Number(raw.settings?.groups?.count ?? 4),
            size: Number(raw.settings?.groups?.size ?? 4),
            matchType,
            advancement: raw.settings?.groups?.advancement === "wins" ? "wins" : "points",
            losersNext: !!raw.settings?.groups?.losersNext,
          }
        : undefined,
    };
    const teams: Team[] = Array.isArray(raw.teams)
      ? raw.teams.map((tm:any) => ({
          id: String(tm?.id ?? crypto.randomUUID()),
          name: String(tm?.name ?? "Team"),
          memberIds: Array.isArray(tm?.memberIds) ? tm.memberIds.map(String) : [],
        }))
      : [];

    return {
      id:String(raw.id??""),
      name:String(raw.name??"Untitled"),
      code: raw.code?String(raw.code):undefined,
      hostId:String(raw.hostId??""),
      players, pending, rounds, status,
      createdAt:Number(raw.createdAt ?? Date.now()),
      updatedAt:Number(raw.updatedAt ?? Date.now()),
      coHosts: Array.isArray(raw.coHosts) ? raw.coHosts.map(String) : [],
      teams,
      settings,
      groupStage: raw.groupStage?.groups ? { groups: raw.groupStage.groups.map((g:any)=>Array.isArray(g)?g.map(String):[]) } : undefined,
    };
  } catch { return null; }
}

/* ---------- GET ---------- */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const v = await getV(env, id);
  const etag = `"t-${v}"`;
  const inm = req.headers.get("if-none-match");
  if (inm && inm === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
        "x-t-version": String(v),
      }
    });
  }

  const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = coerceTournament(JSON.parse(raw));
  if (!doc) return NextResponse.json({ error: "Corrupt" }, { status: 500 });

  return new NextResponse(JSON.stringify(doc), {
    headers: {
      "content-type": "application/json",
      "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
      "x-t-version": String(v),
      ETag: etag,
    }
  });
}

/* ---------- PUT / POST (save) ---------- */
export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = ctx.params.id;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (String(body?.id ?? "") !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  const next = coerceTournament(body);
  if (!next) return NextResponse.json({ error: "Bad doc" }, { status: 400 });

  // maintain indices
  const prevRaw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (prevRaw) {
    try {
      const prev = coerceTournament(JSON.parse(prevRaw));
      if (prev?.hostId && prev.hostId !== next.hostId) await removeFrom(env, THOST(prev.hostId), id);
      const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));
      const nextPlayers = new Set((next.players ?? []).map(p => p.id));
      for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(env, TPLAY(p), id);
      for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(env, TPLAY(p), id);
    } catch {}
  }

  if (next.hostId) await addTo(env, THOST(next.hostId), id);

  next.updatedAt = Date.now();
  await env.KAVA_TOURNAMENTS.put(TKEY(id), JSON.stringify(next));
  await bumpV(env, id);

  return new NextResponse(null, { status: 204 });
}
export async function POST(req: Request, ctx: { params: { id: string } }) {
  return PUT(req, ctx); // allow sendBeacon/keepalive
}

/* ---------- DELETE ---------- */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
  if (raw) {
    try {
      const t = coerceTournament(JSON.parse(raw));
      if (t?.code) await env.KAVA_TOURNAMENTS.delete(`code:${t.code}`);
      if (t?.hostId) await removeFrom(env, THOST(t.hostId), id);
      for (const p of (t?.players ?? [])) await removeFrom(env, TPLAY(p.id), id);
      for (const p of (t?.pending ?? [])) await removeFrom(env, TPLAY(p.id), id);
    } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(TKEY(id));
  await env.KAVA_TOURNAMENTS.delete(TVER(id));

  return new NextResponse(null, { status: 204 });
}
