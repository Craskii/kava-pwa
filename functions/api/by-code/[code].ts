// functions/api/by-code/[code].ts
import { ok, handleOptions } from "../../_utils/cors";

export async function onRequestOptions() { return handleOptions(); }

// GET /api/by-code/1234  -> tournament or null
export async function onRequestGet(ctx: {
  env: { KAVA_TOURNAMENTS: KVNamespace };
  params: { code: string };
}) {
  const kv = ctx.env.KAVA_TOURNAMENTS;
  const code = String(ctx.params.code || "").trim();
  const id = await kv.get(`code:${code}`);
  if (!id) return ok(null);
  const raw = await kv.get(`t:${id}`);
  return ok(raw ? JSON.parse(raw) : null);
}
