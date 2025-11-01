// WebSocket upgrade endpoint that forwards to the Durable Object
export const runtime = 'edge';

import type { NextRequest } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

type Env = {
  LIST_ROOM: DurableObjectNamespace;
  TOURNAMENT_ROOM: DurableObjectNamespace;
};

export async function GET(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const { kind, id } = params;

  const ns =
    kind === 'list' ? env.LIST_ROOM :
    kind === 'tournament' ? env.TOURNAMENT_ROOM :
    null;
  if (!ns) return new Response('bad kind', { status: 400 });

  const stub = ns.get(ns.idFromName(id));
  // Forward the upgrade to the DO (so the DO holds the socket set)
  const url = new URL(req.url);
  url.pathname = `/ws`;
  return stub.fetch(url.toString(), req as unknown as Request);
}
