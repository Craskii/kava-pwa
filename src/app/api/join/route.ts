import { getRequestContext } from "@cloudflare/next-on-pages";
import { NextResponse } from "next/server";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

export async function POST(req: Request) {
  const { env } = getRequestContext<{ env: Env }>();
  const body = await req.json().catch(() => ({}));
  const code = body.code?.toString();

  if (!code || code.length !== 4) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) {
    return NextResponse.json({ error: "No tournament with that code." }, { status: 404 });
  }

  // For now, just return the tournament ID. Later we’ll add player tracking.
  return NextResponse.json({ ok: true, id });
}
