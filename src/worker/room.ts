// src/worker/room.ts
// Durable Object for live room fanout (SSE-first). Keeps a cached snapshot.

export class ListRoom {
  state: DurableObjectState;
  // active SSE subscribers
  subscribers: Set<ReadableStreamDefaultController>;
  snapshot: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.subscribers = new Set();
    this.snapshot = null;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // ---- SSE endpoint ----
    if (path === "/sse" && req.method === "GET") {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        start: (controller) => {
          // remember subscriber
          this.subscribers.add(controller);

          // send initial headers/event
          controller.enqueue(encoder.encode(`: welcome\n\n`));

          // send current snapshot immediately
          if (this.snapshot) {
            const payload = JSON.stringify({ t: "state", data: this.snapshot });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }

          // heartbeat every 25s so CF/浏览器 keep it open
          const hb = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            } catch {
              // if write fails, drop on next abort
            }
          }, 25000);

          // if client aborts, clean up
          const abort = () => {
            clearInterval(hb);
            this.subscribers.delete(controller);
            try { controller.close(); } catch {}
          };
          // next-on-pages / CF provides AbortSignal
          // @ts-ignore
          req.signal?.addEventListener("abort", abort);
        },
        cancel: () => {
          // stream programmatically cancelled
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "connection": "keep-alive",
        },
      });
    }

    // ---- publish: update snapshot + fanout ----
    if (path === "/publish" && req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      this.snapshot = payload;
      this.broadcastJSON({ t: "state", data: this.snapshot });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    // ---- snapshot: return cached ----
    if (path === "/snapshot" && req.method === "GET") {
      return new Response(JSON.stringify(this.snapshot ?? {}), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    // Back-compat: if someone hits /ws (we’re SSE-first now)
    if (path === "/ws" && req.headers.get("upgrade") === "websocket") {
      // Nicely reject; we’re not using WS anymore.
      return new Response("SSE only", { status: 400 });
    }

    return new Response("not found", { status: 404 });
  }

  private broadcastJSON(obj: any) {
    const text = `data: ${JSON.stringify(obj)}\n\n`;
    const enc = new TextEncoder().encode(text);
    const dead: ReadableStreamDefaultController[] = [];
    for (const sub of this.subscribers) {
      try { sub.enqueue(enc); } catch { dead.push(sub); }
    }
    for (const d of dead) this.subscribers.delete(d);
  }
}

export class TournamentRoom extends ListRoom {}
