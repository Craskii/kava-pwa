// src/app/api/by-code/[code]/route.ts
import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {
  const { env } = getRequestContext<{ env: Env }>();
  const code = params.code?.trim();

  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid code format. Expect 4 digits." },
      { status: 400 }
    );
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) {
    return NextResponse.json(
      { error: "No tournament with that code" },
      { status: 404 }
    );
  }

  return NextResponse.json({ id });
}
