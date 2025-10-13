export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getEnv } from '../../_kv';

export async function GET() {
  try {
    const env = getEnv();
    const hasKavaKV = !!(env as any).KAVA_TOURNAMENTS;
    const envType =
      (globalThis as any).__CF_PAGES ? 'cloudflare-pages' :
      (typeof process !== 'undefined' ? 'node' : 'unknown');

    return NextResponse.json({ hasKavaKV, envType });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
