type RoomKey = `${string}:${string}`;
type RoomState = { v: number; data: any };

const g = globalThis as any;
if (!g.__ROOM_HUB__) {
  g.__ROOM_HUB__ = { conns: new Map<RoomKey, Set<WebSocket>>(), state: new Map<RoomKey, RoomState>() };
}
const HUB = g.__ROOM_HUB__ as {
  conns: Map<RoomKey, Set<WebSocket>>;
  state: Map<RoomKey, RoomState>;
};

const keyOf = (kind: string, id: string): RoomKey => `${kind}:${id}`;

export const onRequestGet: PagesFunction = async ({ params }) => {
  const kind = String(params.kind || "");
  const id = decodeURIComponent(String(params.id || ""));
  if (!kind || !id) return new Response("Bad room", { status: 400 });

  const snap = HUB.state.get(keyOf(kind, id));
  if (!snap) return new Response("Not found", { status: 404 });

  // We return the data flattened so your hook can do `...json`
  return new Response(JSON.stringify({ v: snap.v ?? 0, ...snap.data }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
