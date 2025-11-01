// src/app/api/room/[kind]/[id]/sse/route.ts
export const runtime = 'edge';

type Env = {
  LIST_ROOM: DurableObjectNamespace;
  TOURNAMENT_ROOM: DurableObjectNamespace;
};

export async function GET(request: Request, { params }: { params: { kind: 'list'|'tournament'; id: string } }) {
  const env: Env | undefined = (request as any).cf?.env;
  if (!env) return new Response('env missing', { status: 500 });

  const { kind, id } = params;
  const ns = kind === 'list' ? env.LIST_ROOM : env.TOURNAMENT_ROOM;
  const stub = ns.get(ns.idFromName(id));

  // proxy SSE from DO
  return stub.fetch('https://do/sse', {
    method: 'GET',
    headers: { 'accept': 'text/event-stream' },
  } as RequestInit);
}
