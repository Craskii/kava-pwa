// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;
  const p = await ctx.params;

  const safe = (p.code || "").toString().replace(/[^0-9]/g, "").slice(0, 5);
  const id = await env.KAVA_TOURNAMENTS.get(`code:${safe}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id });
}
