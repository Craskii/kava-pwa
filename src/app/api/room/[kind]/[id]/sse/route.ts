export const runtime = "edge";
export const dynamic = "force-dynamic";

type Params = { params: { kind: "list" | "tournament"; id: string } };

export async function GET(req: Request, ctx: Params & { env: any }) {
  const { kind, id } = ctx.params;
  const binding = kind === "list" ? ctx.env.LIST_ROOM : ctx.env.TOURNAMENT_ROOM;
  if (!binding?.idFromName) return new Response("DO binding missing", { status: 500 });

  const stub = binding.get(binding.idFromName(id));
  const upstream = await stub.fetch(new Request("https://do/sse", { method: "GET" }));
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return new Response(`SSE upstream error: ${body}`, { status: 500 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "connection": "keep-alive",
    },
  });
}
