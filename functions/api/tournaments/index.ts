// functions/api/tournaments/index.ts
import { ok, error, handleOptions } from "../../_utils/cors";

type KV = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: unknown) => Promise<void>;
};

type Env = { KAVA_TOURNAMENTS: KV };

type CreateBody = {
  id: string;
  code: string; // 4-digit numeric string
  data: unknown; // full tournament object as stringified JSON on store
};

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

/**
 * POST /api/tournaments
 * Body: { id, code, data }
 * - Ensures code uniqueness (code:<code> -> id)
 * - Stores tournament JSON under id:<id>
 */
export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const id = String(body?.id ?? "").trim();
  const code = String(body?.code ?? "").trim().toUpperCase();
  const data = body?.data;

  if (!id) return error("Missing id", 400);
  if (!/^\d{4}$/.test(code)) return error("Invalid code format (expect 4 digits)", 400);
  if (data == null) return error("Missing data", 400);

  // Check if code already taken
  const existingId = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (existingId && existingId !== id) {
    return error("Code already in use", 409);
  }

  // Save data and code mapping
  await env.KAVA_TOURNAMENTS.put(`id:${id}`, JSON.stringify(data));
  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);

  return ok({ id, code });
}
