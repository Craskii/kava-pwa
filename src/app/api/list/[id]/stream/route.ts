// src/app/api/list/[id]/stream/route.ts
export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // prime snapshot
      let lastV = -1;
      const first = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (first) {
        try { send({ type: "snapshot", list: JSON.parse(first) }); } catch {}
      }

      let alive = true;
      const loop = async () => {
        while (alive) {
          try {
            const rawV = await env.KAVA_TOURNAMENTS.get(LVER(id));
            const v = rawV ? Number(rawV) : 0;
            if (v !== lastV) {
              lastV = v;
              const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
              if (raw) {
                try { send({ type: "snapshot", list: JSON.parse(raw) }); } catch {}
              } else {
                send({ _deleted: true });
              }
            } else {
              // keep-alive
              send({ type: "noop" });
            }
          } catch {
            // ignore
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      };
      loop();

      // @ts-ignore
      controller.signal?.addEventListener?.("abort", () => { alive = false; });
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "connection": "keep-alive",
    },
  });
}
