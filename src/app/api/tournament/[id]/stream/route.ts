// src/app/api/tournament/[id]/stream/route.ts
export const runtime = "edge";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const id = decodeURIComponent(ctx.params.id || '');
  if (!id) return new Response('Missing id', { status: 400 });

  const { readable, writable } = new TransformStream<string>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (obj: unknown) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  let lastVersion = -1;
  let alive = true;

  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
    "connection": "keep-alive",
  });

  const loop = async () => {
    while (alive) {
      try {
        const res = await fetch(new URL(`/api/tournament/${encodeURIComponent(id)}`, req.url), {
          headers: { "cache-control": "no-store" }
        });
        if (res.status === 404) {
          send({ _deleted: true });
          break;
        }
        if (res.ok) {
          const v = Number(res.headers.get("x-t-version") || "0");
          const doc = await res.json().catch(() => null);
          if (Number.isFinite(v) && v !== lastVersion && doc && doc.id && doc.hostId) {
            lastVersion = v;
            send({ tournament: { ...doc, v } });
          }
        }
      } catch {
        // swallow, retry next tick
      }
      // keep-alive comment
      writer.write(encoder.encode(`: ping\n\n`));
      await new Promise(r => setTimeout(r, 1000));
    }

    try { writer.close(); } catch {}
  };

  loop();

  return new Response(readable, { status: 200, headers });
}
