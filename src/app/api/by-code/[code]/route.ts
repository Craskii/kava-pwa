// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

// ---- KV typing helpers ----
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

function extractCodeFromPath(url: string): string {
  const path = new URL(url).pathname; // e.g. /api/by-code/1234
  const code = decodeURIComponent(path.split("/").pop() || "");
  return code.trim().toUpperCase();
}

// GET → resolve code -> id
export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const code = extractCodeFromPath(req.url);
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id });
}

// HEAD → existence check for code
export async function HEAD(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const code = extractCodeFromPath(req.url);
  if (!code) return new NextResponse(null, { status: 400 });

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  return new NextResponse(null, { status: id ? 200 : 404 });
}
