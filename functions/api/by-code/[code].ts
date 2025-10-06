// functions/api/by-code/[code].ts
import { ok, notFound, handleOptions, error } from "../../utils/cors";

type KV = {
  get: (key: string) => Promise<string | null>;
};

type Env = { KAVA_TOURNAMENTS: KV };
type Params = { code?: string };

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: { env: Env; params: Params }): Promise<Response> {
  const { env, params } = context;
  const code = String(params.code ?? "").trim().toUpperCase();
  if (!/^\d{4}$/.test(code)) return error("Invalid code format. Expect 4 digits.", 400);

  // code:<CODE> -> id
  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return notFound("No tournament with that code");

  return ok({ id });
}
