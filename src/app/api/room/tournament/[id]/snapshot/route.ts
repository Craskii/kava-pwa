// src/app/api/room/tournament/[id]/snapshot/route.ts
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { env } = getRequestContext() as any;
  const objId = env.TOURNAMENT_ROOM.idFromName(params.id);
  const stub = env.TOURNAMENT_ROOM.get(objId);
  const u = new URL(req.url); u.pathname = "/snapshot";
  return stub.fetch(u.toString(), { method: "GET", headers: { "cache-control": "no-store" } });
}
