// src/app/api/tournament/update/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const t = await req.json().catch(() => null);
  if (!t?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await env.KAVA_TOURNAMENTS.put(`t:${t.id}`, JSON.stringify(t));
  return NextResponse.json({ ok: true });
}
