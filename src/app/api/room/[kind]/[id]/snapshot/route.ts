// src/app/api/room/[kind]/[id]/snapshot/route.ts
export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(req: Request, { params }: { params: { kind: string; id: string } }) {
  const { env } = getRequestContext() as any;
  const kind = params.kind === "tournament" ? "tournament" : "list";
  const id = params.id;
  const objId = env.KAVA_ROOM_DO.idFromName(`${kind}:${id}`);
  const stub = env.KAVA_ROOM_DO.get(objId);

  const u = new URL(req.url);
  u.pathname = "/snapshot";
  return stub.fetch(u.toString(), { method: "GET", headers: { "cache-control": "no-store" } });
}
