// src/app/api/by-code/[code]/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const { env } = getRequestContext<{ env: Env }>();
  const code = (ctx.params?.code || "").trim();
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id });
}

export async function HEAD(_req: Request, ctx: { params: { code: string } }) {
  const { env } = getRequestContext<{ env: Env }>();
  const code = (ctx.params?.code || "").trim();
  if (!code) return new Response(null, { status: 400 });
  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  return new Response(null, { status: id ? 200 : 404 });
}
