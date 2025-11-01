export const runtime = "edge";
export const dynamic = "force-dynamic";

type Params = { params: { kind: "list" | "tournament"; id: string } };

export async function GET(req: Request, ctx: Params & { env: any }) {
  const { kind, id } = ctx.params;
  const binding = kind === "list" ? ctx.env.LIST_ROOM : ctx.env.TOURNAMENT_ROOM;
  if (!binding?.idFromName) return new Response("DO binding missing", { status: 500 });

  const stub = binding.get(binding.idFromName(id));
  const res = await stub.fetch(new Request("https://do/sse", {
    method: "GET",
    headers: { "accept": "text/event-stream" },
    // @ts-ignore
    signal: (req as any).signal,
  }));

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return new Response(`SSE upstream error: ${body}`, { status: 500 });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "connection": "keep-alive",
    },
  });
}
