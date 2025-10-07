// src/app/api/join/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KV };

/**
 * Join a tournament by 4-digit code.
 * Body: { code: string }
 * Returns: { id, tournament } or 404.
 */
export async function POST(req: Request) {
  const { env } = getRequestContext(); // generic CloudflareEnv
  const kv = (env as unknown as Env).KAVA_TOURNAMENTS; // cast to our shape

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code ?? "").trim();

  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid code. Expect 4 digits." },
      { status: 400 }
    );
  }

  const id = await kv.get(`code:${code}`);
  if (!id) {
    return NextResponse.json(
      { error: "No tournament with that code." },
      { status: 404 }
    );
  }

  const data = await kv.get(`t:${id}`);
  if (!data) {
    return NextResponse.json(
      { error: "Tournament data missing." },
      { status: 404 }
    );
  }

  return NextResponse.json({ id, tournament: JSON.parse(data) });
}
