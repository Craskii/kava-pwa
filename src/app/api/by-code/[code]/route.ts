// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

// normalize to 5-digit numeric code (e.g., "09897")
function norm(code: string) {
  return String(code || "").trim().replace(/\D+/g, "").slice(-5);
}

const CKEY = (code: string) => `code:${code}`;

export async function GET(_: Request, { params }: { params: { code: string } }) {
  const { env: rawEnv } = getRequestContext(); 
  const env = rawEnv as unknown as Env;

  const code = norm(params.code);
  if (!code || code.length !== 5) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(CKEY(code));
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id }, {
    headers: {
      "content-type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
