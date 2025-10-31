// src/app/api/room/[kind]/[id]/publish/route.ts
export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

export async function POST(req: Request, { params }: { params: { kind: string; id: string } }) {
  const { env } = getRequestContext() as any;
  const kind = params.kind === "tournament" ? "tournament" : "list";
  const id = params.id;
  const objId = env.KAVA_ROOM_DO.idFromName(`${kind}:${id}`);
  const stub = env.KAVA_ROOM_DO.get(objId);

  const body = await req.text();
  const u = new URL(req.url);
  u.pathname = "/publish";

  return stub.fetch(u.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}
