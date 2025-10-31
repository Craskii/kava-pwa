// src/app/api/room/list/[id]/publish/route.ts
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { env } = getRequestContext() as any;
  const objId = env.LIST_ROOM.idFromName(params.id);
  const stub = env.LIST_ROOM.get(objId);
  const body = await req.text();
  const u = new URL(req.url); u.pathname = "/publish";
  return stub.fetch(u.toString(), { method: "POST", headers: { "content-type": "application/json" }, body });
}
