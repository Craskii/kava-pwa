// functions/api/tournaments/[id].ts

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, PUT, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export const onRequestOptions = async () => json(null, 204);

// GET /api/tournaments/:id  -> returns the tournament or null
export const onRequestGet = async (context: any) => {
  const { env, params } = context;
  const id = String(params.id || "");
  if (!id) return json({ error: "Missing id" }, 400);

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  return json(raw ? JSON.parse(raw) : null);
};

// PUT /api/tournaments/:id  -> upsert tournament JSON
// body: Tournament (must include { id, code? })
export const onRequestPut = async (context: any) => {
  const { env, params, request } = context;
  const id = String(params.id || "");
  if (!id) return json({ error: "Missing id" }, 400);

  const body = await request.json().catch(() => null);
  if (!body || body.id !== id) return json({ error: "Invalid body" }, 400);

  // If a code is present, enforce uniqueness across tournaments
  const code = (body.code || "").toString().toUpperCase();
  if (code) {
    const existingId = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
    if (existingId && existingId !== id) {
      return json({ error: "Code already in use" }, 409);
    }
    await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  }

  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(body));
  return json({ ok: true });
};
