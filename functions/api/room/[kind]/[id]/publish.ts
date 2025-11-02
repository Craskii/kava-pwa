import { getRoomNamespace, requireId } from "../_shared";

export const onRequestPost: PagesFunction = async (ctx) => {
  const { env, params, request } = ctx;
  const ns = getRoomNamespace(env, String(params.kind));
  const id = requireId(params as any);

  const objectId = ns.idFromName(id);
  const stub = ns.get(objectId);

  const url = new URL("http://do/publish");
  const body = await request.text(); // pass-through body
  const res = await stub.fetch(url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") || "application/json" },
    body,
  });

  return res;
};

// Let GET fail clearly
export const onRequestGet: PagesFunction = async () =>
  new Response("Use POST", { status: 405 });
