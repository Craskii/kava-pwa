// Route: /api/room/:kind/:id/publish  (POST)
// Body: { v: number, data: any }  — stores in hub and broadcasts {t:'state', v, data}

type RoomKey = `${string}:${string}`;
type RoomState = { v: number; data: any };

const g = globalThis as any;
if (!g.__ROOM_HUB__) {
  g.__ROOM_HUB__ = {
    conns: new Map<RoomKey, Set<WebSocket>>(),
    state: new Map<RoomKey, RoomState>(),
  };
}
const HUB: {
  conns: Map<RoomKey, Set<WebSocket>>;
  state: Map<RoomKey, RoomState>;
} = g.__ROOM_HUB__;

const k = (kind: string, id: string): RoomKey => `${kind}:${id}`;

function broadcast(kind: string, id: string, payload: any) {
  const key = k(kind, id);
  const conns = HUB.conns.get(key);
  if (!conns) return;
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const ws of conns) {
    try { ws.send(str); } catch {}
  }
}

export async function onRequestPost(ctx: any): Promise<Response> {
  const { request, params } = ctx;
  const kind = String(params.kind || '');
  const id = decodeURIComponent(String(params.id || ''));
  if (!kind || !id) return new Response('Bad room', { status: 400 });

  let body: any = null;
  try { body = await request.json(); } catch {}
  const v = Number(body?.v ?? 0) || 0;
  const data = body?.data;

  if (!data) return new Response('Missing data', { status: 400 });

  const key = k(kind, id);
  HUB.state.set(key, { v, data });
  broadcast(kind, id, { t: 'state', v, data });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
