// src/worker/room.ts
export class ListRoom {
  state: DurableObjectState;
  subs: Set<ReadableStreamDefaultController>;
  snapshot: any;
  lastHash: string | null;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.subs = new Set();
    this.snapshot = null;
    this.lastHash = null;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    switch (true) {
      case url.pathname === "/sse" && req.method === "GET":
        return this.handleSSE(req);
      case url.pathname === "/publish" && req.method === "POST":
        return this.handlePublish(req);
      case url.pathname === "/snapshot" && req.method === "GET":
        return new Response(JSON.stringify(this.snapshot ?? {}), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      default:
        return new Response("not found", { status: 404 });
    }
  }

  private handleSSE(req: Request) {
    // Short-SSE/long-poll: close stream at ~30s to keep worker time bounded.
    const enc = new TextEncoder();
    let timer: any;
    const stream = new ReadableStream({
      start: (ctl) => {
        this.subs.add(ctl);

        // Initial state (if any)
        if (this.snapshot) {
          ctl.enqueue(enc.encode(`data: ${JSON.stringify({ t: "state", data: this.snapshot })}\n\n`));
        }

        // Heartbeat as comment (no event payload)
        const hb = setInterval(() => {
          try { ctl.enqueue(enc.encode(`:hb ${Date.now()}\n\n`)); } catch {}
        }, 20000);

        // Hard cap (close after ~30s)
        timer = setTimeout(() => {
          try { ctl.close(); } catch {}
          this.subs.delete(ctl);
          clearInterval(hb);
        }, 30000);

        // Client abort
        // @ts-ignore
        req.signal?.addEventListener("abort", () => {
          clearInterval(hb);
          clearTimeout(timer);
          this.subs.delete(ctl);
          try { ctl.close(); } catch {}
        });
      },
      cancel: () => {
        clearTimeout(timer);
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "connection": "keep-alive",
      },
    });
  }

  private async handlePublish(req: Request) {
    const payload = await req.json().catch(() => ({}));
    const next = JSON.stringify(payload);
    if (this.lastHash === next) {
      // No-op publish (identical body).
      return new Response(JSON.stringify({ ok: true, deduped: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    this.lastHash = next;
    this.snapshot = payload;

    const enc = new TextEncoder();
    const chunk = enc.encode(`data: ${JSON.stringify({ t: "state", data: this.snapshot })}\n\n`);
    const dead: ReadableStreamDefaultController[] = [];
    for (const sub of this.subs) {
      try { sub.enqueue(chunk); } catch { dead.push(sub); }
    }
    for (const d of dead) this.subs.delete(d);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }
}
export class TournamentRoom extends ListRoom {}
