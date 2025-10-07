// src/app/api/tournament/[id]/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { env } = getRequestContext<{ env: Env }>();
  const t = await env.KAVA_TOURNAMENTS.get(`t:${params.id}`);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(JSON.parse(t));
}
