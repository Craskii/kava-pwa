// functions/utils/cors.ts

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-requested-with",
};

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data ?? null), {
    ...(init || {}),
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS, ...(init?.headers || {}) },
  });
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return json(data, { status: 200, ...(init || {}) });
}

export function notFound(message = "Not found"): Response {
  return json({ error: message }, { status: 404 });
}

export function error(message = "Bad request", status = 400): Response {
  return json({ error: message }, { status });
}
