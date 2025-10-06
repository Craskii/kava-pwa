// functions/api/by-code/[code].ts
import { ok, error, handleOptions } from "../../_utils/cors";

type Ctx = {
  env: { KAVA_TOURNAMENTS: { get: (k: string) => Promise<string | null> } };
  params: { code: string };
};

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ env, params }: Ctx) {
  const code = String(params.code || "").toUpperCase();
  if (!code) return error("Missing code", 400);

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return ok(null); // client treats null as "not found"

  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  return ok(json ? JSON.parse(json) : null);
}
