// functions/api/tournaments/[id].ts
import { ok, bad, noContent, handleOptions } from "../../_utils/cors";

export async function onRequestOptions() { return handleOptions(); }

// GET/PUT/DELETE a tournament by id
export async function onRequest(ctx: {
  env: { KAVA_TOURNAMENTS: KVNamespace };
  request: Request;
  params: { id: string };
}) {
  const { KAVA_TOURNAMENTS: kv } = ctx.env;
  const id = ctx.params.id;

  if (ctx.request.method === "GET") {
    const raw = await kv.get(`t:${id}`);
    return raw ? ok(JSON.parse(raw)) : ok(null);
  }

  if (ctx.request.method === "PUT") {
    const currentRaw = await kv.get(`t:${id}`);
    if (!currentRaw) return bad("Not found", 404);
    const incoming = await ctx.request.json();
    const merged = { ...JSON.parse(currentRaw), ...incoming };
    await kv.put(`t:${id}`, JSON.stringify(merged));
    return ok(merged);
  }

  if (ctx.request.method === "DELETE") {
    const raw = await kv.get(`t:${id}`);
    if (raw) {
      const t = JSON.parse(raw) as { code?: string };
      if (t.code) await kv.delete(`code:${t.code}`);
      await kv.delete(`t:${id}`);
    }
    return noContent();
  }

  return bad("Method not allowed", 405);
}
