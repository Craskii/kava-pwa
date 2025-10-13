export const runtime = 'edge';

import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  ctx: { env?: Record<string, unknown> }
) {
  const hasKavaKV = !!ctx?.env && !!(ctx.env as any).KAVA_TOURNAMENTS;
  return NextResponse.json({
    hasKavaKV,
    availableBindings: ctx?.env ? Object.keys(ctx.env) : [],
  });
}
