// src/app/api/by-code/[code]/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

// New correct Next.js 15 signature
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  // await params since it’s now a promise in Next 15
  const { code } = await context.params;
  const safeCode = String(code || "").trim();

  if (!/^\d{4}$/.test(safeCode)) {
    return NextResponse.json(
      { error: "Invalid code format. Expect 4 digits." },
      { status: 400 }
    );
  }

  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const id = await kv.get(`code:${safeCode}`);
  if (!id) {
    return NextResponse.json(
      { error: "No tournament found for that code." },
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

  return NextResponse.json(JSON.parse(data));
}
