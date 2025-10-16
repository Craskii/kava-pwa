export const runtime = "edge";
import { NextResponse } from "next/server";
import { getEnv } from "../_kv";

type Table = { a?: string; b?: string };
type Player = { id: string; name: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active";
  createdAt: number; tables: Table[]; players: Player[]; queue: string[];
  v?: number; updatedAt?: number;
};

const LHOST = (hostId: string) => `lidx:h:${hostId}`;     // JSON array of list IDs you host
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`; // JSON array of list IDs you play in
const LKEY = (id: string) => `l:${id}`;

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
      players: Array.isArray(x?.players) ? x.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") })) : [],
      queue: Array.isArray(x?.queue) ? x.queue.map((id: any) => String(id)) : [],
      v: Number(x?.v ?? 0),
      updatedAt: Number(x?.updatedAt ?? 0),
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  try {
    const env = getEnv();
    const u = new URL(req.url);
    const userId = u.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const safeParse = (s: string | null) => {
      try { return (s ? JSON.parse(s) : []) as string[]; } catch { return []; }
    };

    let hostingIds = safeParse(await env.KAVA_TOURNAMENTS.get(LHOST(userId)));
    let playingIds = safeParse(await env.KAVA_TOURNAMENTS.get(LPLAYER(userId)));

    const uniq = <T,>(a: T[]) => Array.from(new Set(a.filter(Boolean)));
    hostingIds = uniq(hostingIds);
    playingIds = uniq(playingIds);

    const fetchOne = async (id: string) => {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (!raw) return null;
      try { return coerceList(JSON.parse(raw)); } catch { return null; }
    };

    const hosting: ListGame[] = [];
    const playing: ListGame[] = [];

    await Promise.all(hostingIds.map(async id => { const x = await fetchOne(id); if (x) hosting.push(x); }));
    await Promise.all(playingIds.map(async id => {
      if (hostingIds.includes(id)) return; // avoid dup if you're host and player
      const x = await fetchOne(id); if (x) playing.push(x);
    }));

    const byCreated = (a: ListGame, b: ListGame) => (Number(b.createdAt)||0) - (Number(a.createdAt)||0);
    hosting.sort(byCreated); playing.sort(byCreated);

    const listVersion = Math.max(
      0,
      ...hosting.map(x => Number(x.updatedAt || x.v || x.createdAt || 0)),
      ...playing.map(x => Number(x.updatedAt || x.v || x.createdAt || 0)),
    );

    return NextResponse.json({ hosting, playing }, { headers: { "x-l-version": String(listVersion) } });
  } catch (e: any) {
    // Fail-soft: never throw HTML at the client
    return NextResponse.json({ hosting: [], playing: [], error: e?.message || "Internal error" }, { status: 200 });
  }
}
