// src/app/api/list/[id]/stream/route.ts
export const runtime = "edge";

function send(ctrl: TransformStreamDefaultController<string>, data: unknown) {
  ctrl.enqueue(`data: ${JSON.stringify(data)}\n\n`);
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const id = decodeURIComponent(ctx.params.id || "");
  if (!id) return new Response("Missing id", { status: 400 });

  const { readable, writable } = new TransformStream<string>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const ctrl = {
    enqueue: (chunk: string) => writer.write(encoder.encode(chunk)),
    close: () => writer.close(),
  };

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let last = -1;
  let cancelled = false;

  (async () => {
    while (!cancelled) {
      try {
        const url = new URL(`/api/list/${encodeURIComponent(id)}`, req.url);
        const res = await fetch(url, { headers: { "Cache-Control": "no-store" } });

        if (res.status === 404) {
          send(ctrl as any, { _deleted: true });
          break;
        }

        if (res.ok) {
          const ver = Number(res.headers.get("x-l-version") || "0");
          if (Number.isFinite(ver) && ver !== last) {
            const doc = await res.json().catch(() => null);
            if (doc && doc.id && doc.hostId) {
              last = ver;
              // IMPORTANT: send the **doc itself** (client expects raw doc), with v attached
              send(ctrl as any, { ...doc, v: ver });
            }
          }
        }
      } catch {
        // swallow and keep polling
      }

      // heartbeat (prevents proxies from killing the pipe)
      ctrl.enqueue(": ping\n\n");
      await new Promise((r) => setTimeout(r, 1500));
    }
    try { (ctrl as any).close(); } catch {}
  })();

  return new Response(readable, { status: 200, headers });
}
