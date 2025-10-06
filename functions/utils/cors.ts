// functions/_utils/cors.ts
const corsHeaders = {
  "access-control-allow-origin": "*", // change to your domain when you want to lock it down
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

export function error(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
