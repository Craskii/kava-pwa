// src/app/api/room/[kind]/[id]/sse/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

type Params = { params: { kind: "list" | "tournament"; id: string } };

// Forward the client SSE request directly to the Durable Object’s /sse.
export async function GET(req: Request, ctx: Params & { env: any }) {
  const { kind, id } = ctx.params;
  const isList = kind === "list";
  const binding = isList ? ctx.env.LIST_ROOM : ctx.env.TOURNAMENT_ROOM;
  if (!binding?.idFromName) {
    return new Response("Durable Object binding missing", { status: 500 });
  }

  const stub = binding.get(binding.idFromName(id));
  const res = await stub.fetch(new Request("https://do/sse", {
    method: "GET",
    headers: { "accept": "text/event-stream" },
    // forward AbortSignal so DO can know when to cleanup
    // @ts-ignore
    signal: (req as any).signal,
  }));

  // Just stream it through as-is.
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "connection": "keep-alive",
    },
  });
}
