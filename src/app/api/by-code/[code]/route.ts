import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type KV = { get: (key: string) => Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KV };

// ✅ Note: the 2nd arg must be `{ params: { code: string } }` (not optional/union)
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = (params.code ?? "").trim().toUpperCase();

  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid code format. Expect 4 digits." },
      { status: 400 }
    );
  }

  const { env } = getRequestContext<{ env: Env }>();
  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);

  if (!id) {
    return NextResponse.json(
      { error: "No tournament with that code" },
      { status: 404 }
    );
  }

  return NextResponse.json({ id });
}
