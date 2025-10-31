// src/app/api/room/[kind]/[id]/sse/route.ts
export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(req: Request, { params }: { params: { kind: string; id: string } }) {
  const { env } = getRequestContext() as any;
  const kind = params.kind === "tournament" ? "tournament" : "list";
  const id = params.id;

  const objId = env.KAVA_ROOM_DO.idFromName(`${kind}:${id}`);
  const stub = env.KAVA_ROOM_DO.get(objId);
  // Proxy the request to the DO's /sse
  const u = new URL(req.url);
  u.pathname = "/sse";
  return stub.fetch(u.toString(), { method: "GET", headers: { "cache-control": "no-store" } });
}
