// functions/api/tournaments/index.ts
import { ok, error, handleOptions } from "../../_utils/cors";

type KV = {
  get: (k: string) => Promise<string | null>;
  put: (k: string, v: string) => Promise<void>;
};

type PostCtx = { env: { KAVA_TOURNAMENTS: KV }; request: Request };

export async function onRequestOptions() {
  return handleOptions();
}

// POST body should contain at least { id, code, ...tournament }
export async function onRequestPost({ env, request }: PostCtx) {
  const body = (await request.json()) as { id?: string; code?: string } & Record<
    string,
    unknown
  >;

  const id = String(body.id || "");
  const code = String(body.code || "").toUpperCase();

  if (!id || !code) return error("Missing id or code", 400);

  // enforce uniqueness
  const existing = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (existing && existing !== id) return error("Code already in use", 409);

  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(body));

  return ok({ ok: true });
}
