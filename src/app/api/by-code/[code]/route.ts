// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getEnv } from "../../_kv";

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const env = getEnv();
  const code = (ctx?.params?.code || "").toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id });
}

export async function HEAD(_req: Request, ctx: { params: { code: string } }) {
  const env = getEnv();
  const code = (ctx?.params?.code || "").toUpperCase();
  const exists = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  return new NextResponse(null, { status: exists ? 200 : 404 });
}
