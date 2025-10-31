// src/app/api/room/list/[id]/sse/route.ts
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { env } = getRequestContext() as any;
  const objId = env.LIST_ROOM.idFromName(params.id);
  const stub = env.LIST_ROOM.get(objId);
  const u = new URL(req.url); u.pathname = "/sse";
  return stub.fetch(u.toString(), { method: "GET", headers: { "cache-control": "no-store" } });
}
