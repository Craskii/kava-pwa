// src/app/api/tournament/[id]/route.ts
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { env } = getRequestContext<{ env: Env }>();
  const id = (ctx.params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(JSON.parse(raw));
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const { env } = getRequestContext<{ env: Env }>();
  const id = (ctx.params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(body));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const { env } = getRequestContext<{ env: Env }>();
  const id = (ctx.params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // remove code -> id mapping too (best-effort)
  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (raw) {
    try {
      const t = JSON.parse(raw) as { code?: string };
      if (t?.code) await env.KAVA_TOURNAMENTS.delete(`code:${t.code}`);
    } catch {}
  }
  await env.KAVA_TOURNAMENTS.delete(`t:${id}`);
  return NextResponse.json({ ok: true });
}
