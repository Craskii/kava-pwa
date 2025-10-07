// src/app/api/tournament/[id]/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

// GET tournament by ID
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // ✅ await required for Next.js 15
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const data = await kv.get(`t:${id}`);
  if (!data) {
    return NextResponse.json(
      { error: "Tournament not found." },
      { status: 404 }
    );
  }

  return NextResponse.json(JSON.parse(data));
}

// PUT update existing tournament
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  await kv.put(`t:${id}`, JSON.stringify(body));

  return NextResponse.json({ ok: true, id });
}

// DELETE tournament by ID
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { env } = getRequestContext<{ env: Env }>();
  const kv = env.KAVA_TOURNAMENTS;

  await kv.delete(`t:${id}`);
  await kv.delete(`code:${id}`); // optional: cleanup

  return NextResponse.json({ ok: true, deleted: id });
}
