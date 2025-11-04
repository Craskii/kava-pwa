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

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  // Must be a WS upgrade
  if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const kind = String(params.kind || "");
  const id = decodeURIComponent(String(params.id || ""));
  if (!kind || !id) return new Response("Bad room", { status: 400 });

  const pair = new WebSocketPair();
  const client = pair[0] as unknown as WebSocket;
  const server = pair[1] as unknown as WebSocket;
  server.accept();

  const k = keyOf(kind, id);
  if (!HUB.conns.has(k)) HUB.conns.set(k, new Set());
  HUB.conns.get(k)!.add(server);

  // Send current snapshot immediately if present
  const snap = HUB.state.get(k);
  if (snap) {
    server.send(JSON.stringify({ t: "state", v: snap.v ?? 0, data: snap.data ?? null }));
  }

  server.addEventListener("message", (ev: MessageEvent) => {
    try {
      const msg = typeof ev.data === "string" ? JSON.parse(ev.data) : {};
      if (msg?.t === "ping") {
        server.send(JSON.stringify({ t: "pong", ts: Date.now() }));
        return;
      }
      // Optional: allow a client to publish via WS
      if (msg?.t === "publish" && msg?.data) {
        const v = Number(msg?.v ?? 0) || 0;
        HUB.state.set(k, { v, data: msg.data });
        const frame = JSON.stringify({ t: "state", v, data: msg.data });
        const conns = HUB.conns.get(k);
        if (conns) for (const ws of conns) { try { ws.send(frame); } catch {} }
      }
    } catch {}
  });

  const cleanup = () => {
    const set = HUB.conns.get(k);
    if (set) {
      set.delete(server);
      if (set.size === 0) HUB.conns.delete(k);
    }
  };
  server.addEventListener("close", cleanup);
  server.addEventListener("error", cleanup);

  return new Response(null, { webSocket: client });
};
