// functions/api/tournaments/index.ts
import { ok, bad, handleOptions } from "../../_utils/cors";

type Player = { id: string; name: string };
type Tournament = {
  id: string;
  code: string;         // "1234"
  name: string;
  venue?: string;
  format?: string;
  startsAt?: string;
  players: Player[];
  createdAt: number;
  hostName?: string;
  hostDeviceId?: string;
};

export async function onRequestOptions() {
  return handleOptions();
}

// POST /api/tournaments  -> create
export async function onRequestPost(ctx: {
  env: { KAVA_TOURNAMENTS: KVNamespace };
  request: Request;
}) {
  const kv = ctx.env.KAVA_TOURNAMENTS;

  let t: Tournament;
  try { t = await ctx.request.json(); } catch { return bad("Invalid JSON"); }
  if (!t?.id || !t?.code) return bad("Missing id or code");

  // Ensure code is 4 digits and unique
  if (!/^\d{4}$/.test(t.code)) return bad("Code must be 4 digits");
  const existingId = await kv.get(`code:${t.code}`);
  if (existingId) return bad("Code already in use", 409);

  await kv.put(`t:${t.id}`, JSON.stringify(t));
  await kv.put(`code:${t.code}`, t.id);
  return ok(t, { status: 201 });
}
