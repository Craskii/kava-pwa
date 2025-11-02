import { getRoomNamespace, requireId } from "../_shared";

export const onRequest: PagesFunction = async (ctx) => {
  const { env, params, request } = ctx;
  const ns = getRoomNamespace(env, String(params.kind));
  const id = requireId(params as any);

  // Forward an Upgrade: websocket to the Durable Object
  const objectId = ns.idFromName(id);
  const stub = ns.get(objectId);

  // Append path /ws on the DO
  const url = new URL("http://do/ws");
  // Forward original headers (esp. upgrade)
  const res = await stub.fetch(url, {
    method: "GET",
    headers: request.headers,
  });

  return res;
};
