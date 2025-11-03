// Cloudflare Pages Function (module syntax) — WebSocket hub per room (process-local)
// Route: /api/room/:kind/:id/ws  (GET, Upgrade: websocket)

type RoomKey = `${string}:${string}`;
type RoomState = { v: number; data: any };

// global hub
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

// Use method-specific handler (Cloudflare Pages likes this for upgrades)
export async function onRequestGet(ctx: any): Promise<Response> {
  const { request, params } = ctx;

  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const kind = String(params.kind || '');
  const id = decodeURIComponent(String(params.id || ''));
  if (!kind || !id) return new Response('Bad room', { status: 400 });

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  server.accept();

  const key = k(kind, id);
  if (!HUB.conns.has(key)) HUB.conns.set(key, new Set());
  HUB.conns.get(key)!.add(server);

  // Send current snapshot to the newcomer
  const snap = HUB.state.get(key);
  if (snap) {
    server.send(JSON.stringify({ t: 'state', v: snap.v ?? 0, data: snap.data ?? null }));
  }

  server.addEventListener('message', (ev) => {
    try {
      const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : {};
      if (msg?.t === 'ping') {
        server.send(JSON.stringify({ t: 'pong', ts: Date.now() }));
        return;
      }
      // Optional: allow clients to publish via WS too
      if (msg?.t === 'publish' && msg?.data) {
        const v = Number(msg?.v ?? 0) || 0;
        HUB.state.set(key, { v, data: msg.data });
        broadcast(kind, id, { t: 'state', v, data: msg.data });
        return;
      }
    } catch {
      // ignore malformed frames
    }
  });

  const cleanup = () => {
    const set = HUB.conns.get(key);
    if (set) {
      set.delete(server);
      if (set.size === 0) HUB.conns.delete(key);
    }
  };
  server.addEventListener('close', cleanup);
  server.addEventListener('error', cleanup);

  // NOTE: For Pages Functions you can omit the 101; this is accepted:
  return new Response(null, { webSocket: client });
}
