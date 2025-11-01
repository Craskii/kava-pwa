export const runtime = "edge";
export const dynamic = "force-dynamic";

type Params = { params: { kind: "list" | "tournament"; id: string } };

export async function POST(req: Request, ctx: Params & { env: any }) {
  const { kind, id } = ctx.params;
  const binding = kind === "list" ? ctx.env.LIST_ROOM : ctx.env.TOURNAMENT_ROOM;
  if (!binding?.idFromName) return new Response("DO binding missing", { status: 500 });

  const stub = binding.get(binding.idFromName(id));
  const res = await stub.fetch("https://do/publish", {
    method: "POST",
    body: await req.text(),
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
