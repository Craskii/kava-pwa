// src/worker/room.ts
export class ListRoom {
  state: DurableObjectState;
  sockets: Set<WebSocket>;
  sseWriters: Set<WritableStreamDefaultWriter<Uint8Array>>;
  snapshot: any;

  constructor(state: DurableObjectState, _env: any) {
    this.state = state;
    this.sockets = new Set();
    this.sseWriters = new Set();
    this.snapshot = null;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // WebSocket channel (still supported)
    if (path === '/ws' && req.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.acceptSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Server-Sent Events channel
    if (path === '/sse' && req.method === 'GET') {
      return this.acceptSSE(req);
    }

    // Publish a new state snapshot and fan out
    if (path === '/publish' && req.method === 'POST') {
      const payload = await req.json().catch(() => ({}));
      this.snapshot = payload;
      const frame = JSON.stringify({ t: 'state', data: this.snapshot, v: Number(this.snapshot?.v ?? 0) });
      this.broadcastWS(frame);
      this.broadcastSSE(frame);
      return json({ ok: true });
    }

    // Fetch the current snapshot
    if (path === '/snapshot' && req.method === 'GET') {
      return json(this.snapshot ?? {});
    }

    return new Response('not found', { status: 404 });
  }

  /* ---------------- WS ---------------- */
  acceptSocket(ws: WebSocket) {
    ws.accept();
    this.sockets.add(ws);

    // Send current snapshot to new client
    if (this.snapshot) {
      try {
        ws.send(JSON.stringify({ t: 'state', data: this.snapshot, v: Number(this.snapshot?.v ?? 0) }));
      } catch {}
    }

    // keepalive
    const ping = () => {
      try { ws.send(JSON.stringify({ t: 'ping', ts: Date.now() })); } catch {}
    };
    const pingTimer = setInterval(ping, 30000);

    const close = () => {
      clearInterval(pingTimer);
      this.sockets.delete(ws);
      try { ws.close(); } catch {}
    };

    ws.addEventListener('message', () => { /* no-op; reserved */ });
    ws.addEventListener('close', close);
    ws.addEventListener('error', close);
  }

  broadcastWS(text: string) {
    const dead: WebSocket[] = [];
    for (const s of this.sockets) {
      try { s.send(text); } catch { dead.push(s); }
    }
    for (const d of dead) this.sockets.delete(d);
  }

  /* ---------------- SSE ---------------- */
  acceptSSE(req: Request) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.sseWriters.add(writer);

    // Immediately send current snapshot (if any)
    if (this.snapshot) {
      this.writeSSE(writer, { t: 'state', data: this.snapshot, v: Number(this.snapshot?.v ?? 0) });
    } else {
      // send a hello comment so the client 'open' fires
      this.writeSSEComment(writer, `hello ${Date.now()}`);
    }

    // keepalive comments (avoid proxies killing idle connections)
    const ka = setInterval(() => this.writeSSEComment(writer, `ping ${Date.now()}`), 25000);

    // When client disconnects
    const onAbort = () => {
      clearInterval(ka);
      this.sseWriters.delete(writer);
      try { writer.close(); } catch {}
    };
    req.signal.addEventListener('abort', onAbort);

    const headers = {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
    };

    return new Response(readable, { headers });
  }

  broadcastSSE(text: string) {
    const payload = strToUint8(`data: ${text}\n\n`);
    const dead: WritableStreamDefaultWriter<Uint8Array>[] = [];
    for (const w of this.sseWriters) {
      try { w.write(payload); } catch { dead.push(w); }
    }
    for (const d of dead) this.sseWriters.delete(d);
  }

  writeSSE(writer: WritableStreamDefaultWriter<Uint8Array>, obj: any) {
    const line = `data: ${JSON.stringify(obj)}\n\n`;
    return writer.write(strToUint8(line));
  }

  writeSSEComment(writer: WritableStreamDefaultWriter<Uint8Array>, comment: string) {
    return writer.write(strToUint8(`: ${comment}\n\n`));
  }
}

export class TournamentRoom extends ListRoom {}

/* ---------------- utils ---------------- */
function json(v: any, status = 200) {
  return new Response(JSON.stringify(v), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function strToUint8(s: string) {
  return new TextEncoder().encode(s);
}
