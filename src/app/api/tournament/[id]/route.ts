// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = (ctx?.params?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!json) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(JSON.parse(json));
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = (ctx?.params?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // Save entire tournament object
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(body));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = (ctx?.params?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Also clear code:<code> if present
  const json = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (json) {
    const t = JSON.parse(json) as { code?: string };
    if (t?.code) await env.KAVA_TOURNAMENTS.delete(`code:${t.code}`);
  }

  await env.KAVA_TOURNAMENTS.delete(`t:${id}`);
  return NextResponse.json({ ok: true });
}
