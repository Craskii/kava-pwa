// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

// Minimal KV type used by this route
type KV = {
  get(key: string): Promise<string | null>;
};

// Cloudflare Pages env shape
type Env = {
  KAVA_TOURNAMENTS: KV;
};

// Small helper to please Next 15’s App Router params typing
type RouteContext<T extends Record<string, string>> = {
  params: T;
};

export async function GET(
  _req: Request,
  context: RouteContext<{ code: string }>
) {
  const { env: raw } = getRequestContext();
  const env = raw as unknown as Env;

  const safeCode = (context?.params?.code ?? "").replace(/[^0-9A-Za-z_-]/g, "");
  if (!safeCode) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${safeCode}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id });
}
