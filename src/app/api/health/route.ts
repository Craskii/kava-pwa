// src/app/api/health/route.ts
export const runtime = "edge";
import { getEnvOrError } from "../_utils/env";

export async function GET() {
  const env = getEnvOrError();
  if ("error" in env) return env.error;
  try {
    // do a trivial get to prove binding works
    await env.env.KAVA_TOURNAMENTS.get("__healthcheck__");
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
