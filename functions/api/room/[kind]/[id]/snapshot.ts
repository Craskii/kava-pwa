// Returns the last known state for a room from the in-memory hub.
// Used by your poll fallback.

type RoomKey = `${string}:${string}`;
type RoomState = { v: number; data: any };

const g = (globalThis as any);
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

function key(kind: string, id: string): RoomKey {
  return `${kind}:${id}`;
}

export async function onRequest(context: any): Promise<Response> {
  const { params } = context;
  const kind = String(params.kind || '');
  const id = decodeURIComponent(String(params.id || ''));
  if (!kind || !id) return new Response('Bad room', { status: 400 });

  const snap = HUB.state.get(key(kind, id));
  if (!snap) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify({ v: snap.v ?? 0, ...snap.data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
