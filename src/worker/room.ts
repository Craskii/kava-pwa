// src/worker/rooms.ts

class BaseRoom {
  state: DurableObjectState;
  env: any;
  sinks = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  lastVersion = 0;
  lastPayload: any = null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/sse")) {
      return this.handleSSE();
    }
    if (req.method === "POST" && url.pathname.endsWith("/publish")) {
      const body = await req.json().catch(() => ({}));
      const version = Number(body?.version ?? 0);
      const payload = body?.payload ?? null;
      if (Number.isFinite(version) && version > this.lastVersion) {
        this.lastVersion = version;
        this.lastPayload = payload;
        await this.broadcast(payload);
      }
      return new Response(null, { status: 204 });
    }
    if (req.method === "GET" && url.pathname.endsWith("/snapshot")) {
      return new Response(JSON.stringify({ version: this.lastVersion, payload: this.lastPayload }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    return new Response("Not found", { status: 404 });
  }

  private handleSSE() {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const enc = new TextEncoder();
        const writeObj = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        // send snapshot immediately
        if (this.lastPayload) writeObj(this.lastPayload);

        // keep-alive ping
        const keep = setInterval(() => writeObj({ __ping: Date.now() }), 25_000);

        // Writable writer for broadcast
        // @ts-ignore - internal access to writer
        const writer: WritableStreamDefaultWriter<Uint8Array> = controller.writable?.getWriter?.() ?? (controller as any);
        this.sinks.add(writer);

        // cleanup on cancel/close
        // @ts-ignore
        controller._cleanup = () => {
          clearInterval(keep);
          this.sinks.delete(writer);
        };
      },
      cancel: (reason) => {
        try {
          // @ts-ignore
          reason?._cleanup?.();
        } catch {}
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  }

  private async broadcast(payload: any) {
    const enc = new TextEncoder();
    const buf = enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
    const dead: WritableStreamDefaultWriter<Uint8Array>[] = [];
    for (const w of this.sinks) {
      try { await w.write?.(buf); } catch { dead.push(w); }
    }
    for (const w of dead) this.sinks.delete(w);
  }
}

export class ListRoom extends BaseRoom {}
export class TournamentRoom extends BaseRoom {}
