// src/worker/room.ts
export class ListRoom {
  state: DurableObjectState;
  subscribers: Set<ReadableStreamDefaultController>;
  snapshot: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.subscribers = new Set();
    this.snapshot = null;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    switch (url.pathname) {
      case "/sse": {
        if (req.method !== "GET") return new Response("method", { status: 405 });
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          start: (controller) => {
            this.subscribers.add(controller);
            controller.enqueue(enc.encode(`: hello\n\n`));
            if (this.snapshot) {
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ t: "state", data: this.snapshot })}\n\n`)
              );
            }
            const hb = setInterval(() => {
              try { controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`)); } catch {}
            }, 25000);
            // @ts-ignore
            req.signal?.addEventListener("abort", () => {
              clearInterval(hb);
              this.subscribers.delete(controller);
              try { controller.close(); } catch {}
            });
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            "connection": "keep-alive",
          },
        });
      }
      case "/publish": {
        if (req.method !== "POST") return new Response("method", { status: 405 });
        const payload = await req.json().catch(() => ({}));
        this.snapshot = payload;
        this.broadcastJSON({ t: "state", data: this.snapshot });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      case "/snapshot": {
        return new Response(JSON.stringify(this.snapshot ?? {}), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      default:
        return new Response("not found", { status: 404 });
    }
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
