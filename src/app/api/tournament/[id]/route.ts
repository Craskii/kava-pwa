// src/app/api/tournament/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;
  const id = (await ctx.params).id;
  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = JSON.parse(raw);
  return NextResponse.json(t, { headers: { "x-t-version": String(t.v ?? 0) } });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;
  const id = (await ctx.params).id;

  const ifMatch = Number(req.headers.get("if-match") || "0");
  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const current = JSON.parse(raw);
  const curV = Number(current.v ?? 0);
  if (ifMatch !== curV) {
    return NextResponse.json({ error: "Version conflict", serverV: curV }, { status: 409 });
  }

  let next;
  try { next = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  next.v = curV + 1;
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(next));
  return NextResponse.json({ ok: true }, { status: 204, headers: { "x-t-version": String(next.v) } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;
  const id = (await ctx.params).id;

  const raw = await env.KAVA_TOURNAMENTS.get(`t:${id}`);
  if (raw) {
    const t = JSON.parse(raw);
    if (t?.code) await env.KAVA_TOURNAMENTS.delete(`code:${t.code}`);
  }
  await env.KAVA_TOURNAMENTS.delete(`t:${id}`);
  return NextResponse.json({ ok: true }, { status: 204 });
}
