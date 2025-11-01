// Forward GET snapshot to "/snapshot" on the DO
import type { NextRequest } from 'next/server';
export const runtime = 'edge';

type Env = {
  LIST_ROOMS: DurableObjectNamespace;
  TOURNAMENT_ROOMS: DurableObjectNamespace;
};

export async function GET(req: NextRequest, ctx: { env: Env }) {
  const { env } = ctx;
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const kind = parts[2];
  const id = parts[3];
  if (!kind || !id) return new Response('Bad room path', { status: 400 });

  const ns =
    kind === 'list' ? env.LIST_ROOMS :
    kind === 'tournament' ? env.TOURNAMENT_ROOMS : null;
  if (!ns) return new Response('Unknown room kind', { status: 400 });

  const stub = ns.get(ns.idFromName(id));

  const forwardUrl = new URL('https://do.internal/snapshot');
  const fwd = new Request(forwardUrl.toString(), { method: 'GET' });

  return stub.fetch(fwd);
}
