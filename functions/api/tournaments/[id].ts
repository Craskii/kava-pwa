// functions/api/tournaments/[id].ts
export const onRequestGet: PagesFunction = async ({ env, params }) => {
  const id = String(params.id);
  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  return new Response(json ?? "null", { headers: { "content-type": "application/json" } });
};

export const onRequestPut: PagesFunction = async ({ env, request, params }) => {
  const id = String(params.id);
  const body = await request.text();
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, body); // full doc replace
  return new Response("ok");
};

export const onRequestDelete: PagesFunction = async ({ env, params }) => {
  const id = String(params.id);
  // remove tournament
  await env.KAVA_TOURNAMENTS.delete(`t:${id}`);
  // remove any code mapping that points to this id
  // (we store reverse mapping in tournament doc to know the code)
  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (json) {
    const t = JSON.parse(json);
    if (t.code) await env.KAVA_TOURNAMENTS.delete(`code:${t.code}`);
  }
  return new Response("deleted");
};
