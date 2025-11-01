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
    if (url.pathname === '/ws' && req.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.acceptSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/publish' && req.method === 'POST') {
      const payload = await req.json().catch(() => ({}));
      // update cached snapshot and fan out
      this.snapshot = payload;
      this.broadcast(JSON.stringify({ t: 'state', data: this.snapshot }));
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname === '/snapshot') {
      return new Response(JSON.stringify(this.snapshot ?? {}), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    return new Response('not found', { status: 404 });
  }

  acceptSocket(ws: WebSocket) {
    ws.accept();
    this.sockets.add(ws);

    // send current snapshot to new client
    if (this.snapshot) {
      try { ws.send(JSON.stringify({ t: 'state', data: this.snapshot })); } catch {}

    }
    // keepalive (server side)
    const ping = () => { try { ws.send(JSON.stringify({ t: 'ping', ts: Date.now() })); } catch {} };
    const pingTimer = setInterval(ping, 30000);

    ws.addEventListener('message', (evt) => {
      // optional: handle client pings or client->server actions
      // const msg = JSON.parse(evt.data);
    });

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
    for (const s of this.sockets) {
      try { s.send(text); } catch { dead.push(s); }
    }
    for (const d of dead) this.sockets.delete(d);
  }
}

export class TournamentRoom extends ListRoom {}
