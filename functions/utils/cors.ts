// functions/_utils/cors.ts
export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json",
};

export function ok(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, ...(init.headers || {}) },
  });
}
export function bad(msg: string, status = 400) {
  return ok({ error: msg }, { status });
}
export function noContent(status = 204) {
  return new Response(null, { status, headers: corsHeaders });
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
