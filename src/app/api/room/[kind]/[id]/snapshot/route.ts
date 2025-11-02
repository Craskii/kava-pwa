// src/app/api/room/[kind]/[id]/snapshot/route.ts
import type { NextRequest } from 'next/server';
export const runtime = 'edge';

export async function GET(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = params.kind === 'tournament' ? 'tournament' : 'list';
  const id = params.id;

  // @ts-ignore
  const env = (globalThis as any).env || (req as any).env || {};
  const ns = kind === 'list' ? env.LIST_ROOM : env.TOURNAMENT_ROOM;
  if (!ns || !ns.idFromName) return new Response('DO binding missing', { status: 500 });

  const doId = ns.idFromName(id);
  const url = new URL('https://do.example/snapshot');
  const res = await ns.get(doId).fetch(url);
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
