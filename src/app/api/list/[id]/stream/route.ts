export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let lastV = -1;

      const first = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (first) {
        try {
          const list = JSON.parse(first);
          send({ type: "snapshot", list });
        } catch {}
      }

      let alive = true;
      const loop = async () => {
        while (alive) {
          try {
            const vRaw = await env.KAVA_TOURNAMENTS.get(LVER(id));
            const v = Number(vRaw || "0");
            if (v !== lastV) {
              lastV = v;
              const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
              if (raw) {
                try {
                  const list = JSON.parse(raw);
                  send({ type: "snapshot", list });
                } catch { send({ type: "noop" }); }
              } else {
                send({ _deleted: true });
              }
            } else {
              send({ type: "noop" });
            }
          } catch { /* ignore transient */ }
          await new Promise(r => setTimeout(r, 1000));
        }
      };
      loop();

      // @ts-ignore
      controller.signal?.addEventListener?.("abort", () => { alive = false; });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
