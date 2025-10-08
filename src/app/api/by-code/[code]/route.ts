// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const safeCode = (ctx?.params?.code ?? "").trim().toUpperCase();
  if (!safeCode) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${safeCode}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id });
}

export async function HEAD(_req: Request, ctx: { params: { code: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const safeCode = (ctx?.params?.code ?? "").trim().toUpperCase();
  if (!safeCode) return new Response(null, { status: 400 });

  const id = await env.KAVA_TOURNAMENTS.get(`code:${safeCode}`);
  return new Response(null, { status: id ? 200 : 404 });
}
