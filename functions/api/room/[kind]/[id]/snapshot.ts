// Route: /api/room/:kind/:id/snapshot  (GET)

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

export async function onRequestGet(ctx: any): Promise<Response> {
  const { params } = ctx;
  const kind = String(params.kind || '');
  const id = decodeURIComponent(String(params.id || ''));
  if (!kind || !id) return new Response('Bad room', { status: 400 });

  const snap = HUB.state.get(k(kind, id));
  if (!snap) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify({ v: snap.v ?? 0, ...snap.data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
