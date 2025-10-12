// src/app/api/join/route.ts
export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getEnv } from '../_kv';

type Player = { id: string; name: string };
type Tournament = {
  id: string;
  hostId: string;
  name: string;
  code?: string;
  status?: 'setup' | 'active' | 'completed';
  players: Player[];
  pending?: Player[];
  createdAt?: number;
  updatedAt?: number;
};

export async function POST(req: Request) {
  try {
    const env = getEnv();
    const { code, player } = (await req.json()) as { code?: string; player?: Player };
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    if (!player?.id || !player?.name)
      return NextResponse.json({ error: 'Missing player' }, { status: 400 });

    const mapKey = `code:${code.toUpperCase()}`;
    const mapped = await env.KAVA_TOURNAMENTS.get(mapKey);
    if (!mapped) return NextResponse.json({ error: 'Invalid code' }, { status: 404 });

    const { id } = JSON.parse(mapped) as { id: string };

    const tKey = `t:${id}`;
    const raw = await env.KAVA_TOURNAMENTS.get(tKey);
    if (!raw) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const t = JSON.parse(raw) as Tournament;
    t.pending ||= [];

    if ((t.players || []).some(p => p.id === player.id)) {
      return NextResponse.json({ id: t.id, status: 'joined' });
    }
    if ((t.pending || []).some(p => p.id === player.id)) {
      return NextResponse.json({ id: t.id, status: 'pending' });
    }

    t.pending!.push({ id: player.id, name: player.name });
    t.updatedAt = Date.now();
    await env.KAVA_TOURNAMENTS.put(tKey, JSON.stringify(t));

    return NextResponse.json({ id: t.id, status: 'pending' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Join failed' }, { status: 500 });
  }
}
