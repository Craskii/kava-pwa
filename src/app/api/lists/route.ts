// src/app/api/lists/route.ts
export const runtime = "edge";
import { NextResponse } from "next/server";
import { getEnv } from "../_kv"; // uses your existing helper

type Table = { a?: string; b?: string };
type Player = { id: string; name: string };
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];
  v?: number;
  updatedAt?: number; // tolerate older docs that don’t have this
};

// Indices (written on create/updates elsewhere)
const LHOST = (hostId: string) => `lidx:h:${hostId}`;    // string[] of list IDs
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`; // string[] of list IDs
const LKEY = (id: string) => `l:${id}`;

// Coerce any stored value into a safe ListGame so the UI never crashes
function coerceList(x: any): ListGame | null {
  try {
    return {
      id: String(x?.id ?? ""),
      name: String(x?.name ?? "Untitled"),
      code: x?.code ? String(x.code) : undefined,
      hostId: String(x?.hostId ?? ""),
      status: "active",
      createdAt: Number(x?.createdAt ?? Date.now()),
      tables: Array.isArray(x?.tables) ? x.tables.map((t: any) => ({ a: t?.a, b: t?.b })) : [],
      players: Array.isArray(x?.players)
        ? x.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") }))
        : [],
      queue: Array.isArray(x?.queue) ? x.queue.map((id: any) => String(id)) : [],
      v: Number(x?.v ?? 0),
      updatedAt: Number(x?.updatedAt ?? 0),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const env = getEnv();
    const u = new URL(req.url);
    const userId = u.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Read host-owned IDs
    const hostRaw = (await env.KAVA_TOURNAMENTS.get(LHOST(userId))) || "[]";
    let hostIds: string[] = [];
    try { hostIds = JSON.parse(hostRaw) || []; } catch { hostIds = []; }

    // Read player-member IDs
    const playRaw = (await env.KAVA_TOURNAMENTS.get(LPLAYER(userId))) || "[]";
    let playIds: string[] = [];
    try { playIds = JSON.parse(playRaw) || []; } catch { playIds = []; }

    // Deduplicate
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
    hostIds = uniq(hostIds);
    playIds = uniq(playIds);

    // Fetch docs
    const hosting: ListGame[] = [];
    const playing: ListGame[] = [];

    // Helper to fetch & coerce one list by id
    const fetchOne = async (id: string) => {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (!raw) return null;
      try {
        const doc = JSON.parse(raw);
        return coerceList(doc);
      } catch {
        return null;
      }
    };

    // Parallel fetches with soft-fail
    await Promise.all(
      hostIds.map(async (id) => {
        const x = await fetchOne(id);
        if (x) hosting.push(x);
      })
    );
    await Promise.all(
      playIds.map(async (id) => {
        // Avoid double list if user is both host and player
        if (hostIds.includes(id)) return;
        const x = await fetchOne(id);
        if (x) playing.push(x);
      })
    );

    // Sort newest first on createdAt
    const byCreated = (a: ListGame, b: ListGame) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    hosting.sort(byCreated);
    playing.sort(byCreated);

    // Version header: max of updatedAt, v, or createdAt from returned docs
    const listVersion = Math.max(
      0,
      ...hosting.map((x) => Number(x.updatedAt || x.v || x.createdAt || 0)),
      ...playing.map((x) => Number(x.updatedAt || x.v || x.createdAt || 0))
    );

    return NextResponse.json(
      { hosting, playing },
      { headers: { "x-l-version": String(listVersion) } }
    );
  } catch (e: any) {
    // Never throw raw errors into the client — always return JSON
    return NextResponse.json({ hosting: [], playing: [], error: e?.message || "Internal error" }, { status: 200 });
  }
}
