// src/app/api/list/[id]/stream/route.ts
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

// Minimal KV typing
type KVNamespace = {
  get(key: string): Promise<string | null>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

// in-memory channel per list id (edge note: per-isolate best effort)
const channels: Record<string, Set<ReadableStreamDefaultController>> = {};
const enc = new TextEncoder();
const listKey = (id: string) => `l:${id}`;

// Helper to push an SSE event to all listeners for a list id
export function pushListUpdate(id: string, data: any) {
  const set = channels[id];
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const c of set) {
    try { c.enqueue(enc.encode(payload)); } catch {}
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const stream = new ReadableStream({
    start(controller) {
      if (!channels[id]) channels[id] = new Set();
      channels[id].add(controller);

      // send the latest snapshot immediately
      (async () => {
        try {
          const raw = await env.KAVA_TOURNAMENTS.get(listKey(id));
          if (raw) controller.enqueue(enc.encode(`data: ${raw}\n\n`));
        } catch {}
      })();

      // keep-alive comments every 15s
      const ka = setInterval(() => {
        try { controller.enqueue(enc.encode(':\n\n')); } catch {}
      }, 15000);

      // cleanup on client disconnect
      // @ts-ignore - controller.signal exists in Edge runtime
      controller.signal?.addEventListener('abort', () => {
        clearInterval(ka);
        channels[id].delete(controller);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
