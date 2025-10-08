// src/app/api/by-code/[code]/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

// GET /api/by-code/:code  -> { id } or 404
export async function GET(
  _req: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const safeCode = (code || "").trim().toUpperCase();

  const { env } = getRequestContext<{ env: Env }>();
  const id = await env.KAVA_TOURNAMENTS.get(`code:${safeCode}`);

  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id });
}

// HEAD /api/by-code/:code  -> 200 if exists, 404 if not
export async function HEAD(
  _req: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const safeCode = (code || "").trim().toUpperCase();

  const { env } = getRequestContext<{ env: Env }>();
  const id = await env.KAVA_TOURNAMENTS.get(`code:${safeCode}`);

  return new Response(null, { status: id ? 200 : 404 });
}
