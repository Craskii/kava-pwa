export const runtime = "edge";
import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = { get(key: string): Promise<string | null> };
type Env = { KAVA_TOURNAMENTS: KVNamespace };

const LHOST = (hostId: string) => `lidx:h:${hostId}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;
const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;

type ListGame = {
  id: string; hostId: string; players: { id: string; name: string }[];
  createdAt: number; name: string; code?: string;
};

async function ids(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function GET(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const u = new URL(req.url);
  const userId = u.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const [hostIds, playIds] = await Promise.all([
    ids(env, LHOST(userId)),
    ids(env, LPLAYER(userId)),
  ]);

  const fetchMany = async (arr: string[]) => {
    const out: ListGame[] = [];
    for (const id of arr) {
      const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
      if (raw) out.push(JSON.parse(raw));
    }
    return out;
  };

  const [hosting, playing] = await Promise.all([fetchMany(hostIds), fetchMany(playIds)]);

  let maxV = 0;
  for (const id of [...new Set([...hostIds, ...playIds])]) {
    const vRaw = await env.KAVA_TOURNAMENTS.get(LVER(id));
    const v = vRaw ? Number(vRaw) : 0;
    if (Number.isFinite(v)) maxV = Math.max(maxV, v);
  }

  hosting.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  playing.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  return new NextResponse(JSON.stringify({ hosting, playing }), {
    headers: { "content-type":"application/json", "x-l-version": String(maxV), "Cache-Control":"no-store" }
  });
}
