// functions/api/by-code/[code].ts
export const onRequestGet: PagesFunction = async ({ env, params }) => {
  const code = String(params.code).toUpperCase();
  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return new Response("null", { headers: { "content-type": "application/json" } });
  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  return new Response(json ?? "null", { headers: { "content-type": "application/json" } });
};
