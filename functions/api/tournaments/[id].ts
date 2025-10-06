// functions/api/tournaments/[id].ts
import { ok, handleOptions } from "../../_utils/cors";

type KV = {
  get: (k: string) => Promise<string | null>;
  put: (k: string, v: string) => Promise<void>;
  delete: (k: string) => Promise<void>;
};

type Ctx = { env: { KAVA_TOURNAMENTS: KV }; params: { id: string }; request: Request };

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ env, params }: Ctx) {
  const json = await env.KAVA_TOURNAMENTS.get(`t:${params.id}`);
  return ok(json ? JSON.parse(json) : null);
}

export async function onRequestPut({ env, params, request }: Ctx) {
  const body = await request.json();
  await env.KAVA_TOURNAMENTS.put(`t:${params.id}`, JSON.stringify(body));
  return ok({ ok: true });
}

export async function onRequestDelete({ env, params }: Ctx) {
  await env.KAVA_TOURNAMENTS.delete(`t:${params.id}`);
  return ok({ ok: true });
}
