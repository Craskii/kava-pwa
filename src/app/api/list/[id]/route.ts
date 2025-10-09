// src/app/api/list/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- Cloudflare KV types ---------- */
type KVListResult = { keys: { name: string }[]; cursor?: string; list_complete?: boolean };
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* ---------- types (match lib/storage.ts ListGame) ---------- */
type Player = { id: string; name: string };
type Table = { a?: string; b?: string };
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue: string[];
  v?: number; // server version; we'll expose via header
};

/* ---------- version helpers ---------- */
const verKey = (id: string) => `lv:${id}`;
const listKey = (id: string) => `l:${id}`;

async function getVersion(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(verKey(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function setVersion(env: Env, id: string, v: number): Promise<void> {
  await env.KAVA_TOURNAMENTS.put(verKey(id), String(v));
}

/* ---------- GET ---------- */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = params.id;
  const raw = await env.KAVA_TOURNAMENTS.get(listKey(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = JSON.parse(raw) as ListGame;
  const v = await getVersion(env, id);

  return NextResponse.json(doc, { headers: { "x-l-version": String(v) } });
}

/* ---------- PUT (optimistic concurrency via If-Match) ---------- */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = params.id;
  const ifMatch = req.headers.get("if-match");
  const curV = await getVersion(env, id);

  if (ifMatch !== null && String(curV) !== String(ifMatch)) {
    return NextResponse.json({ error: "Version conflict" }, { status: 412 });
  }

  let body: ListGame;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  // write doc
  await env.KAVA_TOURNAMENTS.put(listKey(id), JSON.stringify(body));

  // bump version
  const nextV = curV + 1;
  await setVersion(env, id, nextV);

  // 204 with new version header (lib/storage.ts expects this)
  return new NextResponse(null, { status: 204, headers: { "x-l-version": String(nextV) } });
}

/* ---------- DELETE (also frees the code mapping) ---------- */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const id = params.id;

  // read to find code for cleanup
  const raw = await env.KAVA_TOURNAMENTS.get(listKey(id));
  if (raw) {
    try {
      const doc = JSON.parse(raw) as ListGame;
      if (doc.code) {
        // We stored JSON mapping in create: code:<code> = {"type":"list","id":...}
        await env.KAVA_TOURNAMENTS.delete(`code:${doc.code}`);
      }
    } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(listKey(id));
  await env.KAVA_TOURNAMENTS.delete(verKey(id));

  return new NextResponse(null, { status: 204 });
}
