// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";
import { NextResponse } from "next/server";
import { getEnv } from "../../_kv";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const env = getEnv();
  const id = ctx?.params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = JSON.parse(raw);
  return new NextResponse(JSON.stringify(t), {
    headers: { "content-type": "application/json", "x-t-version": String(t.updatedAt || t.createdAt || 0) }
  });
}

// Full replace save (client sends whole tournament)
export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const env = getEnv();
  const id = ctx?.params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || body.id !== id) {
    return NextResponse.json({ error: "Body must include matching id" }, { status: 400 });
  }
  body.updatedAt = Date.now();
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(body));
  if (body.code) await env.KAVA_TOURNAMENTS.put(`code:${String(body.code).toUpperCase()}`, id);

  return new NextResponse(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "x-t-version": String(body.updatedAt) }
  });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const env = getEnv();
  const id = ctx?.params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (raw) {
    const t = JSON.parse(raw);
    if (t?.code) await env.KAVA_TOURNAMENTS.delete(`code:${String(t.code).toUpperCase()}`);
  }
  await env.KAVA_TOURNAMENTS.delete(`t:${id}`);
  return new NextResponse(null, { status: 204 });
}
