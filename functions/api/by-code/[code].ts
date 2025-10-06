// functions/api/by-code/[code].ts

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export const onRequestOptions = async () => json(null, 204);

export const onRequestGet = async (context: any) => {
  const { env, params } = context;
  const code = String(params.code || "").toUpperCase();
  if (!code) return json({ error: "Missing code" }, 400);

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return json(null); // no tournament with that code

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  return json(raw ? JSON.parse(raw) : null);
};
