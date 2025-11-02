// src/worker/room.ts
export class ListRoom {
  state: DurableObjectState;
  sockets: Set<WebSocket>;
  snapshot: any;

  // SSE subscribers (writers) + ping timers
  sseWriters: Set<WritableStreamDefaultWriter>;
  pings: Map<WritableStreamDefaultWriter, number>;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.sockets = new Set();
    this.snapshot = null;
    this.sseWriters = new Set();
    this.pings = new Map();
  }

  async fetch(req: Request) {
    const url = new URL(req.url);

    // ---- SSE ----
    if (url.pathname === '/sse' && req.method === 'GET') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      this.sseWriters.add(writer);

      // send initial snapshot
      await this.writeSSE(writer, this.snapshot ?? {});

      // heartbeat (keep connections alive)
      const timer = setInterval(() => {
        void this.writeRaw(writer, `: ping ${Date.now()}\n\n`);
      }, 25000);
      this.pings.set(writer, (timer as unknown as number));

      // cleanup when client disconnects
      (writer.closed as Promise<void>).finally(() => {
        clearInterval(this.pings.get(writer) as unknown as number);
        this.pings.delete(writer);
        this.sseWriters.delete(writer);
      });

      return new Response(readable, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          'connection': 'keep-alive',
        },
      });
    }

    // ---- Publish ----
    if (url.pathname === '/publish' && req.method === 'POST') {
      const payload = await req.json().catch(() => ({}));
      this.snapshot = payload;
      await this.broadcastSnapshot(payload);
      // Also notify WS clients for compatibility
      this.broadcast(JSON.stringify({ t: 'state', data: this.snapshot }));
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }

    // ---- Snapshot ----
    if (url.pathname === '/snapshot') {
      return new Response(JSON.stringify(this.snapshot ?? {}), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    // ---- WebSocket (optional) ----
    if (url.pathname === '/ws' && req.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.acceptSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  /* ===== WS support (unchanged) ===== */
  acceptSocket(ws: WebSocket) {
    ws.accept();
    this.sockets.add(ws);
    if (this.snapshot) {
      try { ws.send(JSON.stringify({ t: 'state', data: this.snapshot })); } catch {}
    }
    const ping = () => { try { ws.send(JSON.stringify({ t: 'ping', ts: Date.now() })); } catch {} };
    const pingTimer = setInterval(ping, 30000);
    const close = () => {
      clearInterval(pingTimer);
      this.sockets.delete(ws);
      try { ws.close(); } catch {}
    };
    ws.addEventListener('message', () => {});
    ws.addEventListener('close', close);
    ws.addEventListener('error', close);
  }
  broadcast(text: string) {
    const dead: WebSocket[] = [];
    for (const s of this.sockets) {
      try { s.send(text); } catch { dead.push(s); }
    }
    for (const d of dead) this.sockets.delete(d);
  }

  /* ===== SSE helpers ===== */
  async writeRaw(writer: WritableStreamDefaultWriter, s: string) {
    try { await writer.write(new TextEncoder().encode(s)); } catch {}
  }
  async writeSSE(writer: WritableStreamDefaultWriter, obj: any) {
    await this.writeRaw(writer, `data: ${JSON.stringify(obj)}\n\n`);
  }
  async broadcastSnapshot(obj: any) {
    const text = `data: ${JSON.stringify(obj)}\n\n`;
    const enc = new TextEncoder().encode(text);
    await Promise.all([...this.sseWriters].map(async w => { try { await w.write(enc); } catch {} }));
  }
}

export class TournamentRoom extends ListRoom {}
