export const runtime = "edge";
export const dynamic = "force-dynamic";

type K = "list" | "tournament";
type Params = { params: { kind: K; id: string } };

export async function GET(req: Request, ctx: Params & { env: any }) {
  const { kind, id } = ctx.params;
  const binding = kind === "list" ? ctx.env.LIST_ROOM : ctx.env.TOURNAMENT_ROOM;
  if (!binding?.idFromName) return new Response("DO binding missing", { status: 500 });

  const stub = binding.get(binding.idFromName(id));
  // Pass the original Request straight to the DO. No body copying, no piping.
  const doURL = new URL("https://do/sse");
  const out = new Request(doURL, { method: "GET", headers: req.headers });
  return stub.fetch(out);
}
