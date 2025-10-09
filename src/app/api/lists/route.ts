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
type Table = { a?: string; b?: string };
type ListGame = {
  id: string; name: string; code?: string; hostId: string; status: "active";
  createdAt: number; tables: Table[]; players: Player[]; queue: string[];
};

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ hosting: [], playing: [] });

  const hosting: ListGame[] = [];
  const playing: ListGame[] = [];

  let cursor: string | undefined = undefined;
  do {
    const res = await env.KAVA_TOURNAMENTS.list({ prefix: "l:", limit: 1000, cursor });
    cursor = res.cursor;

    const ids = res.keys.map(k => k.name.slice(2));
    const docs = await Promise.all(ids.map(id => env.KAVA_TOURNAMENTS.get(`l:${id}`)));

    docs.forEach(raw => {
      if (!raw) return;
      try {
        const doc = JSON.parse(raw) as ListGame;
        if (doc.hostId === userId) hosting.push(doc);
        else if (doc.players?.some(p => p.id === userId)) playing.push(doc);
      } catch {}
    });
  } while (cursor);

  return NextResponse.json({ hosting, playing });
}
