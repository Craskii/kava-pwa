import { getRoomNamespace, requireId } from "../_shared";

export const onRequestGet: PagesFunction = async (ctx) => {
  const { env, params } = ctx;
  const ns = getRoomNamespace(env, String(params.kind));
  const id = requireId(params as any);

  const objectId = ns.idFromName(id);
  const stub = ns.get(objectId);

  const url = new URL("http://do/snapshot");
  const res = await stub.fetch(url, { method: "GET" });

  // Always no-store so clients don't cache
  const hdrs = new Headers(res.headers);
  hdrs.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, headers: hdrs });
};
