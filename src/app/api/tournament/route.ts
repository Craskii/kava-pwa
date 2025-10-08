// src/app/api/tournaments/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const url = new URL(req.url);
  const hostIdFilter = url.searchParams.get("hostId") || undefined;

  let cursor: string | undefined = undefined;
  const items: any[] = [];

  // list all tournament objects under prefix "t:"
  do {
    const page = await env.KAVA_TOURNAMENTS.list({ prefix: "t:", cursor });
    for (const k of page.keys) {
      const raw = await env.KAVA_TOURNAMENTS.get(k.name);
      if (!raw) continue;
      try {
        const t = JSON.parse(raw);
        if (!hostIdFilter || t.hostId === hostIdFilter) items.push(t);
      } catch {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return NextResponse.json(items);
}
