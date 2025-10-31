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
  const enc = new TextEncoder();
  const out = { enqueue: (s:string)=>writer.write(enc.encode(s)), close: ()=>writer.close() };

  const headers = new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let lastV = -1;
  let cancelled = false;

  const loop = async () => {
    while (!cancelled) {
      try {
        const res = await fetch(new URL(`/api/list/${encodeURIComponent(id)}`, req.url), {
          headers: { 'Cache-Control': 'no-store' },
        });
        if (res.status === 404) { send(out as any, { _deleted: true }); break; }
        if (res.ok) {
          const ver = Number(res.headers.get('x-l-version') || '0');
          if (Number.isFinite(ver) && ver !== lastV) {
            lastV = ver;
            const doc = await res.json().catch(()=>null);
            if (doc && doc.id) send(out as any, { ...doc, v: ver }); // <-- raw payload (no {list:...})
          }
        }
      } catch {}
      out.enqueue(': ping\n\n');
      await new Promise(r=>setTimeout(r, 1200)); // ~1.2s
    }
    try { (out as any).close(); } catch {}
  };

  loop();

  return new Response(readable, { status: 200, headers });
}
