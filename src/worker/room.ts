export class ListRoom {
  state: DurableObjectState;
  sockets: Set<WebSocket>;
  snapshot: any;
  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.sockets = new Set();
    this.snapshot = null;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);

    // --- SSE endpoint ---
    if (url.pathname === '/sse') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      const send = async (evt: string, data: any) => {
        const line = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`;
        await writer.write(new TextEncoder().encode(line));
      };

      // Immediately send current snapshot
      await send('state', this.snapshot ?? {});

      // Keep-alive pings
      const i = setInterval(() => {
        writer.write(new TextEncoder().encode(`event: ping\ndata: ${Date.now()}\n\n`));
      }, 25000);

      // Hook broadcast to also write to this stream
      const unsub = this._tap((text) => {
        writer.write(new TextEncoder().encode(`event: state\ndata: ${text}\n\n`));
      });

      const close = async () => {
        clearInterval(i);
        unsub();
        try { await writer.close(); } catch {}
      };

      // DO can’t detect client abort directly; rely on connection idle timeout.
      return new Response(readable, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          'connection': 'keep-alive',
        }
      });
    }

    // --- WebSocket endpoint (kept) ---
    if (url.pathname === '/ws' && req.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.acceptSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // --- Publish ---
    if (url.pathname === '/publish' && req.method === 'POST') {
      const payload = await req.json().catch(() => ({}));
      this.snapshot = payload;
      const text = JSON.stringify({ t: 'state', data: this.snapshot });
      this.broadcast(text);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }

    // --- Snapshot ---
    if (url.pathname === '/snapshot') {
      return new Response(JSON.stringify(this.snapshot ?? {}), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    return new Response('not found', { status: 404 });
  }

  // tap helper to mirror broadcasts into SSE stream
  _taps = new Set<(text: string) => void>();
  _tap(cb: (text: string) => void) { this._taps.add(cb); return () => this._taps.delete(cb); }

  acceptSocket(ws: WebSocket) {
    ws.accept();
    this.sockets.add(ws);
    if (this.snapshot) { try { ws.send(JSON.stringify({ t: 'state', data: this.snapshot })); } catch {} }

    const ping = () => { try { ws.send(JSON.stringify({ t: 'ping', ts: Date.now() })); } catch {} };
    const pingTimer = setInterval(ping, 30000);

    const close = () => {
      clearInterval(pingTimer);
      this.sockets.delete(ws);
      try { ws.close(); } catch {}
    };
    ws.addEventListener('close', close);
    ws.addEventListener('error', close);
  }

  broadcast(text: string) {
    const dead: WebSocket[] = [];
    for (const s of this.sockets) { try { s.send(text); } catch { dead.push(s); } }
    for (const d of dead) this.sockets.delete(d);
    // mirror to taps (SSE clients)
    for (const t of this._taps) { try { t(text); } catch {} }
  }
}
export class TournamentRoom extends ListRoom {}
