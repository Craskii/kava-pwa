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

export const onRequestPost: PagesFunction = async ({ request, params }) => {
  const kind = String(params.kind || "");
  const id = decodeURIComponent(String(params.id || ""));
  if (!kind || !id) return new Response("Bad room", { status: 400 });

  let body: any = null;
  try { body = await request.json(); } catch {}
  const v = Number(body?.v ?? 0) || 0;
  const data = body?.data;
  if (!data) return new Response("Missing data", { status: 400 });

  const k = keyOf(kind, id);
  HUB.state.set(k, { v, data });

  const conns = HUB.conns.get(k);
  if (conns) {
    const frame = JSON.stringify({ t: "state", v, data });
    for (const ws of conns) { try { ws.send(frame); } catch {} }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
