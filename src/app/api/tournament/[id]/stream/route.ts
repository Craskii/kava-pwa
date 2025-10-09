// src/app/api/tournament/[id]/stream/route.ts
export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

function keyOf(id: string) { return `t:${id}`; }

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      // helper to send SSE event
      const send = (obj: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      // First snapshot
      let lastVersion = -1;
      const first = await env.KAVA_TOURNAMENTS.get(keyOf(id));
      if (first) {
        try {
          const t = JSON.parse(first);
          lastVersion = Number(t.version || 0);
          send({ type: "snapshot", tournament: t });
        } catch {}
      }

      // Poll KV every 1000ms; push only when version changes
      let alive = true;
      const loop = async () => {
        while (alive) {
          try {
            const raw = await env.KAVA_TOURNAMENTS.get(keyOf(id));
            if (raw) {
              const t = JSON.parse(raw);
              const v = Number(t.version || 0);
              if (v !== lastVersion) {
                lastVersion = v;
                send({ type: "snapshot", tournament: t });
              } else {
                // keep-alive/no-op to prevent intermediaries closing idle streams
                send({ type: "noop" });
              }
            }
          } catch {
            // swallow; next tick will retry
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      };
      loop();

      // Close hook
      // @ts-ignore — not typed on Edge yet
      controller.signal?.addEventListener?.("abort", () => { alive = false; });

      // SSE headers: set once when stream starts
    },
    cancel() { /* no-op */ },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",       // Nginx proxies
      "connection": "keep-alive",
    },
  });
}
