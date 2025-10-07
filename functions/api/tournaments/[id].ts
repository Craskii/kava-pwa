// functions/api/tournaments/[id].ts
import { ok, notFound, error, handleOptions } from "../../_utils/cors";

type KV = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

type Env = { KAVA_TOURNAMENTS: KV };
type Params = { id?: string };

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

/** GET /api/tournaments/[id] -> tournament JSON */
export async function onRequestGet(context: { env: Env; params: Params }): Promise<Response> {
  const { env, params } = context;
  const id = String(params.id ?? "").trim();
  if (!id) return error("Missing id", 400);

  const raw = await env.KAVA_TOURNAMENTS.get(`id:${id}`);
  if (!raw) return notFound("Tournament not found");
  return ok(JSON.parse(raw));
}

/** PUT /api/tournaments/[id]  Body: { data, code? } */
export async function onRequestPut(context: { env: Env; params: Params; request: Request }): Promise<Response> {
  const { env, params, request } = context;
  const id = String(params.id ?? "").trim();
  if (!id) return error("Missing id", 400);

  type Body = { data: unknown; code?: string };
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return error("Invalid JSON body", 400);
  }
  const { data, code } = body;
  if (data == null) return error("Missing data", 400);

  // persist tournament
  await env.KAVA_TOURNAMENTS.put(`id:${id}`, JSON.stringify(data));

  // handle code update if provided
  if (typeof code === "string" && code.trim()) {
    const normalized = code.trim().toUpperCase();
    if (!/^\d{4}$/.test(normalized)) return error("Invalid code format (expect 4 digits)", 400);

    const existingId = await env.KAVA_TOURNAMENTS.get(`code:${normalized}`);
    if (existingId && existingId !== id) return error("Code already in use", 409);

    await env.KAVA_TOURNAMENTS.put(`code:${normalized}`, id);
  }

  return ok({ id });
}

/** DELETE /api/tournaments/[id] -> deletes id + code mapping (if any) */
export async function onRequestDelete(context: { env: Env; params: Params }): Promise<Response> {
  const { env, params } = context;
  const id = String(params.id ?? "").trim();
  if (!id) return error("Missing id", 400);

  // delete the tournament record
  await env.KAVA_TOURNAMENTS.delete(`id:${id}`);

  // try to remove code mapping by scanning likely code keys if you store it in app;
  // If your app knows the code, it should send a separate request to free the mapping.
  // For safety we just return OK here.
  return ok({ deleted: true });
}
