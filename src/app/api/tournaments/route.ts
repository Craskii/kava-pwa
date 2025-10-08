import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type KV = {
  get: (key: string) => Promise<string | null>;
  list: (opts?: { prefix?: string; limit?: number; cursor?: string }) => Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
};
type Env = { KAVA_TOURNAMENTS: KV };

export async function GET(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "").trim();
  const hostId = (url.searchParams.get("hostId") || "").trim();

  async function getAllTournamentIds(): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.KAVA_TOURNAMENTS.list({ prefix: "t:", cursor });
      for (const k of page.keys) {
        const id = k.name.slice(2);
        if (id) ids.push(id);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return ids;
  }

  const ids = await getAllTournamentIds();
  const tournaments = await Promise.all(
    ids.map(async (id) => {
      const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
      if (!json) return null;
      try { return JSON.parse(json); } catch { return null; }
    })
  ).then(arr => arr.filter(Boolean));

  if (userId) {
    const hosting = tournaments.filter((t: any) => t.hostId === userId);
    const playing = tournaments.filter((t: any) =>
      t.hostId !== userId &&
      ((t.players || []).some((p: any) => p.id === userId) ||
       (t.pending || []).some((p: any) => p.id === userId))
    );
    return NextResponse.json({ hosting, playing }, { headers: { "cache-control": "no-store" } });
  }

  if (hostId) {
    const hosting = tournaments.filter((t: any) => t.hostId === hostId);
    return NextResponse.json(hosting, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(tournaments, { headers: { "cache-control": "no-store" } });
}
