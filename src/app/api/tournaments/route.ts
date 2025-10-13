export const runtime = 'edge';

import { NextResponse } from 'next/server';

type Tournament = {
  id: string;
  hostId: string;
  players?: { id: string; name: string }[];
  createdAt?: number;
  updatedAt?: number;
  name?: string;
  code?: string;
};

export async function GET(
  req: Request,
  ctx: { env?: { KAVA_TOURNAMENTS?: KVNamespace } }
) {
  try {
    const kv = ctx?.env?.KAVA_TOURNAMENTS;
    if (!kv) {
      return NextResponse.json(
        { error: 'KV binding KAVA_TOURNAMENTS is not available' },
        { status: 500 }
      );
    }

    const u = new URL(req.url);
    const userId = u.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const hosting: Tournament[] = [];
    const playing: Tournament[] = [];

    let cursor: string | undefined = undefined;
    do {
      const l = await kv.list({ prefix: 't:', limit: 100, cursor });
      for (const k of l.keys) {
        const raw = await kv.get(k.name);
        if (!raw) continue;
        let t: Tournament | undefined;
        try { t = JSON.parse(raw); } catch { continue; }
        if (!t) continue;
        if (t.hostId === userId) hosting.push(t);
        else if ((t.players || []).some(p => p.id === userId)) playing.push(t);
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);

    const byCreated = (a: Tournament, b: Tournament) =>
      (b.createdAt || 0) - (a.createdAt || 0);
    hosting.sort(byCreated);
    playing.sort(byCreated);

    const listVersion = Math.max(
      0,
      ...hosting.map(t => t.updatedAt || 0),
      ...playing.map(t => t.updatedAt || 0)
    );

    return NextResponse.json({ hosting, playing, listVersion });
  } catch (err: any) {
    const msg = (err && (err.stack || err.message)) || String(err) || 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
