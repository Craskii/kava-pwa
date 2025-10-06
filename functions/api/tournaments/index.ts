// functions/api/tournaments/index.ts

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export const onRequestOptions = async () => json(null, 204);

// POST /api/tournaments  -> create or update (upsert) by body.id
// body: Tournament (must include { id, code? })
export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return json({ error: "Invalid body" }, 400);

  const id = String(body.id);
  const code = (body.code || "").toString().toUpperCase();

  if (code) {
    const existingId = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
    if (existingId && existingId !== id) {
      return json({ error: "Code already in use" }, 409);
    }
    await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);
  }

  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(body));
  return json({ ok: true, id, code });
};
