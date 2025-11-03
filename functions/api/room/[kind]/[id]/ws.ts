// Cloudflare Pages Function (Module syntax)
// WebSocket hub per room (process-local). Good enough to get you unblocked.

export const config = {
  // IMPORTANT: allow upgrade
  // (Some CF environments infer this automatically; keeping here for clarity)
};

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

function broadcast(kind: string, id: string, msg: any) {
  const k = key(kind, id);
  const set = HUB.conns.get(k);
  if (!set) return;
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const ws of set) {
    try { ws.send(data); } catch {}
  }
}

export async function onRequest(context: any): Promise<Response> {
  const { request, params } = context;
  const url = new URL(request.url);

  // Only handle websocket upgrade
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const kind = String(params.kind || '');
  const id = decodeURIComponent(String(params.id || ''));
  if (!kind || !id) return new Response('Bad room', { status: 400 });

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  // Attach server side
  server.accept();

  const k = key(kind, id);
  if (!HUB.conns.has(k)) HUB.conns.set(k, new Set());
  HUB.conns.get(k)!.add(server);

  // On open: send current snapshot if any
  const snap = HUB.state.get(k);
  if (snap) {
    server.send(JSON.stringify({ t: 'state', v: snap.v ?? 0, data: snap.data ?? null }));
  }

  server.addEventListener('message', (ev) => {
    // Simple protocol:
    // - {t:'ping'} => reply pong
    // - {t:'publish', data: <doc>, v: <number> } => store + broadcast
    try {
      const body = typeof ev.data === 'string' ? JSON.parse(ev.data) : {};
      if (body?.t === 'ping') {
        server.send(JSON.stringify({ t: 'pong', ts: Date.now() }));
        return;
      }
      if (body?.t === 'publish' && body?.data) {
        const v = Number(body?.v ?? 0) || 0;
        HUB.state.set(k, { v, data: body.data });
        broadcast(kind, id, { t: 'state', v, data: body.data });
        return;
      }
    } catch {
      // ignore bad frames
    }
  });

  server.addEventListener('close', () => {
    const set = HUB.conns.get(k);
    if (set) {
      set.delete(server);
      if (set.size === 0) HUB.conns.delete(k);
    }
  });

  // Return the upgraded socket
  return new Response(null, { status: 101, webSocket: client });
}
