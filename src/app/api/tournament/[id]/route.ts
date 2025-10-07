// src/app/api/tournament/[id]/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KV };

// GET tournament by ID
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { env } = getRequestContext();
  const kv = (env as unknown as Env).KAVA_TOURNAMENTS;

  const data = await kv.get(`t:${id}`);
  if (!data) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  return NextResponse.json(JSON.parse(data));
}

// PUT update existing tournament
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { env } = getRequestContext();
  const kv = (env as unknown as Env).KAVA_TOURNAMENTS;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  await kv.put(`t:${id}`, JSON.stringify(body));
  return NextResponse.json({ ok: true, id });
}

// DELETE tournament by ID
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { env } = getRequestContext();
  const kv = (env as unknown as Env).KAVA_TOURNAMENTS;

  // optional: try to remove code mapping if we can fetch it
  const data = await kv.get(`t:${id}`);
  if (data) {
    try {
      const t = JSON.parse(data) as { code?: string };
      if (t.code) {
        await kv.delete(`code:${t.code}`);
      }
    } catch {
      // ignore parse errors
    }
  }

  await kv.delete(`t:${id}`);
  return NextResponse.json({ ok: true, deleted: id });
}
