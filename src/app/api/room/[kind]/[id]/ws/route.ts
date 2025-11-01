// Forward WS upgrade to the correct Durable Object and rewrite the path to "/ws"
import type { NextRequest } from 'next/server';
export const runtime = 'edge';

type Env = {
  LIST_ROOMS: DurableObjectNamespace;        // wrangler.toml binding for ListRoom
  TOURNAMENT_ROOMS: DurableObjectNamespace;  // wrangler.toml binding for TournamentRoom
};

export async function GET(req: NextRequest, ctx: { env: Env }) {
  const { env } = ctx;
  const url = new URL(req.url);
  // /api/room/<kind>/<id>/ws
  const parts = url.pathname.split('/').filter(Boolean);
  const kind = parts[2];
  const id = parts[3];
  if (!kind || !id) return new Response('Bad room path', { status: 400 });

  const ns =
    kind === 'list' ? env.LIST_ROOMS :
    kind === 'tournament' ? env.TOURNAMENT_ROOMS : null;
  if (!ns) return new Response('Unknown room kind', { status: 400 });

  // stable DO id
  const stub = ns.get(ns.idFromName(id));

  // IMPORTANT: DO expects "/ws"
  const forwardUrl = new URL('https://do.internal/ws');
  // clone request with same headers (incl. Upgrade)
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
    // @ts-expect-error: duplex is required by CF runtime for WS upgrade passthrough
    duplex: 'half',
  };
  const fwd = new Request(forwardUrl.toString(), init);

  return stub.fetch(fwd);
}
