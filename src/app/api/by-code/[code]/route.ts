import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type KV = { get: (key: string) => Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KV };

export async function GET(_req: Request, context: unknown) {
  const { params } = (context as { params?: { code?: string } }) ?? {};
  const code = String(params?.code ?? "").trim().toUpperCase();

  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid code format. Expect 4 digits." },
      { status: 400 }
    );
  }

  // Cast the Cloudflare env to our Env shape so TS stops complaining
  const { env } = getRequestContext();
  const kv = (env as unknown as Env).KAVA_TOURNAMENTS;

  const id = await kv.get(`code:${code}`);
  if (!id) {
    return NextResponse.json(
      { error: "No tournament with that code" },
      { status: 404 }
    );
  }

  return NextResponse.json({ id });
}
