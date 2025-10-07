import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KV = { get: (key: string) => Promise<string | null> };

export async function GET(
  _req: Request,
  ctx: { params: { code?: string } }
) {
  const code = String(ctx.params.code ?? "").trim().toUpperCase();

  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format. Expect 4 digits." }, { status: 400 });
  }

  // Access Cloudflare bindings when using Next-on-Pages
  const { env } = getRequestContext() as { env: { KAVA_TOURNAMENTS: KV } };

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) {
    return NextResponse.json({ error: "No tournament with that code" }, { status: 404 });
  }

  return NextResponse.json({ id });
}
