// src/app/api/join/route.ts
export const runtime = "edge";
import { NextResponse } from "next/server";
import { getEnv } from "../_kv";

type Body = { code: string; player: { id: string; name: string } };

export async function POST(req: Request) {
  const env = getEnv();
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.code || !b?.player?.id || !b?.player?.name) {
    return NextResponse.json({ error: "Missing code or player" }, { status: 400 });
  }
  const code = b.code.toUpperCase();
  const id = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!id) return NextResponse.json({ error: "No tournament with that code." }, { status: 404 });

  const key = `t:${id}`;
  const raw = await env.KAVA_TOURNAMENTS.get(key);
  if (!raw) return NextResponse.json({ error: "Tournament missing." }, { status: 404 });
  const t = JSON.parse(raw) as any;

  // if already present anywhere, ignore
  const present = (t.players || []).some((p: any) => p.id === b.player.id)
    || (t.pending || []).some((p: any) => p.id === b.player.id)
    || (t.queue || []).includes(b.player.id);
  if (!present) t.pending = [...(t.pending || []), b.player];

  t.updatedAt = Date.now();
  await env.KAVA_TOURNAMENTS.put(key, JSON.stringify(t));

  return new NextResponse(JSON.stringify({ ok: true, id }), {
    headers: { "content-type": "application/json", "x-t-version": String(t.updatedAt) }
  });
}
