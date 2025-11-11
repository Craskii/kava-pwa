// src/app/api/room/[kind]/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// If you already have a "roomHub" (Durable Object, WebSocket registry, etc.),
// you can import and broadcast there. For now, we just return OK so the 404 disappears.

export async function POST(req: NextRequest, { params }: { params: { kind: string; id: string } }) {
  try {
    const { kind, id } = params;
    const body = await req.json().catch(() => null);
    const version = body?.v ?? 0;
    const data = body?.data ?? {};

    // TODO: hook into your actual room broadcast if needed, e.g.:
    // await roomHub.publish(kind, id, data);

    console.log(`[room publish] ${kind}/${id} v${version}`);

    return NextResponse.json({ ok: true, kind, id, v: version });
  } catch (e: any) {
    console.error('[publish error]', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export const GET = () =>
  NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
