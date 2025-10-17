// src/app/api/list/[id]/stream/route.ts
export const runtime = 'edge';

function send(res: TransformStreamDefaultController<string>, data: unknown) {
  res.enqueue(`data: ${JSON.stringify(data)}\n\n`);
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const id = decodeURIComponent(ctx.params.id || '');
  if (!id) return new Response('Missing id', { status: 400 });

  const { readable, writable } = new TransformStream<string>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const streamCtrl = {
    enqueue: (chunk: string) => writer.write(encoder.encode(chunk)),
    close: () => writer.close(),
  };

  const headers = new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let lastVersion = -1;
  let cancelled = false;

  const poll = async () => {
    while (!cancelled) {
      try {
        const res = await fetch(new URL(`/api/list/${encodeURIComponent(id)}`, req.url), {
          headers: { 'Cache-Control': 'no-store' },
        });

        if (res.status === 404) {
          send(streamCtrl as any, { _deleted: true });
          break;
        }

        if (res.ok) {
          const verHeader = Number(res.headers.get('x-l-version') || '0');
          const doc = await res.json().catch(() => null);

          if (Number.isFinite(verHeader) && verHeader !== lastVersion && doc && doc.id && doc.hostId) {
            lastVersion = verHeader;
            send(streamCtrl as any, { list: { ...doc, v: verHeader } });
          }
        }
      } catch {
        // swallow errors and keep polling
      }

      // heartbeat
      streamCtrl.enqueue(': ping\n\n');

      await new Promise((r) => setTimeout(r, 2000));
    }

    try { (streamCtrl as any).close(); } catch {}
  };

  poll();

  return new Response(readable, {
    status: 200,
    headers,
  });
}
