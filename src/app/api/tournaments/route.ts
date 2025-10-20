// src/app/api/tournaments/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const THOST = (hostId: string) => `tidx:h:${hostId}`; // string[]
const TPLAYER = (playerId: string) => `tidx:p:${playerId}`; // string[]
const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;

type Tournament = {
  id: string;
  hostId: string;
  players: { id: string; name: string }[];
  createdAt: number;
  updatedAt?: number;
  name: string;
  code?: string;
};

async function readIds(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

async function fetchMany(env: Env, ids: string[]): Promise<Tournament[]> {
  const out: Tournament[] = [];
  for (const id of ids) {
    const raw = await env.KAVA_TOURNAMENTS.get(TKEY(id));
    if (raw) {
      try { out.push(JSON.parse(raw)); } catch {}
    }
  }
  return out;
}

async function maxVersion(env: Env, ids: string[]): Promise<number> {
  let maxV = 0;
  // NB: KV doesn't have batch get; keep it short and cheap
  for (const id of ids) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(TVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }
  return maxV;
}

async function hashETag(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `"w-${hex}"`;
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const url = new URL(req.url);
  const userId =
    url.searchParams.get("userId") ||
    url.searchParams.get("me") ||
    req.headers.get("x-me") ||
    req.headers.get("x-user-id") ||
    ""; // allow empty → return 200 with {hosting:[], playing:[]}

  // If no userId, short-circuit with empty payload + weak ETag that stays stable
  if (!userId) {
    const payload = { hosting: [] as Tournament[], playing: [] as Tournament[] };
    const e = await hashETag("no-user");
    const inm = req.headers.get("if-none-match");
    if (inm && inm === e) {
      return new NextResponse(null, { status: 304, headers: { ETag: e, "Cache-Control": "no-store" } });
    }
    return new NextResponse(JSON.stringify(payload), {
      headers: { "content-type": "application/json", "cache-control": "no-store", ETag: e, "x-t-version": "0" },
    });
  }

  // Load id indexes for this user
  const [hostIds, playIds] = await Promise.all([
    readIds(env, THOST(userId)),
    readIds(env, TPLAYER(userId)),
  ]);
  const uniqIds = Array.from(new Set([...hostIds, ...playIds]));

  // Build a fast tag BEFORE fetching full docs (cheap in steady state)
  const maxV = await maxVersion(env, uniqIds);
  const preTag = await hashETag(`u=${userId}|v=${maxV}|h=${hostIds.join(",")}|p=${playIds.join(",")}`);

  // If client already has this state, return 304 — saves the heavier KV reads
  const inm = req.headers.get("if-none-match");
  if (inm && inm === preTag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: preTag, "Cache-Control": "no-store", "x-t-version": String(maxV) },
    });
  }

  // Fetch full docs (only when needed)
  const [hosting, playing] = await Promise.all([
    fetchMany(env, hostIds),
    fetchMany(env, playIds),
  ]);

  hosting.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  playing.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-t-version": String(maxV),
      ETag: preTag,
    },
  });
}
