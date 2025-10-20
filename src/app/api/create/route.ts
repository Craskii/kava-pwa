// src/app/api/create/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

// --- KV types & helpers ---
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
  KAVA_LISTS?: KVNamespace; // optional if you haven't wired lists yet
};

const TKEY = (id: string) => `t:${id}`;
const TVER = (id: string) => `tv:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`;
const TPLAYER = (playerId: string) => `tidx:p:${playerId}`;

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const LHOST = (hostId: string) => `lidx:h:${hostId}`;

function uid() {
  // short, URL-safe id
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

async function readJson<T>(kv: KVNamespace, key: string, fallback: T): Promise<T> {
  const raw = await kv.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function writeIndex(kv: KVNamespace, key: string, addId: string) {
  const arr = await readJson<string[]>(kv, key, []);
  if (!arr.includes(addId)) {
    arr.unshift(addId);
    await kv.put(key, JSON.stringify(arr.slice(0, 500))); // keep index bounded
  }
}

async function bumpVersion(kv: KVNamespace, key: string) {
  const cur = await kv.get(key);
  const n = cur ? Number(cur) || 0 : 0;
  await kv.put(key, String(n + 1));
}

type CreateBody =
  | { type: "tournament"; name?: string; hostId?: string; code?: string }
  | { type: "list"; name?: string; hostId?: string; code?: string };

export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: CreateBody | null = null;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body?.type || "tournament";
  const now = Date.now();

  if (type === "tournament") {
    if (!env.KAVA_TOURNAMENTS) {
      return NextResponse.json({ error: "KV not bound: KAVA_TOURNAMENTS" }, { status: 500 });
    }
    const hostId =
      body?.hostId ||
      req.headers.get("x-me") ||
      req.headers.get("x-user-id") ||
      ""; // allow empty but it's not useful

    if (!hostId) {
      // Don't crash the UI; return a 400 with clear message the client can show.
      return NextResponse.json({ error: "Missing hostId" }, { status: 400 });
    }

    const id = uid();
    const doc = {
      id,
      name: body?.name?.trim() || "New Tournament",
      code: (body?.code || "").trim() || undefined,
      hostId,
      status: "setup" as const,
      players: [] as { id: string; name: string }[],
      pending: [] as { id: string; name: string }[],
      rounds: [] as any[],
      createdAt: now,
      updatedAt: now,
      v: 1,
    };

    await env.KAVA_TOURNAMENTS.put(TKEY(id), JSON.stringify(doc));
    await writeIndex(env.KAVA_TOURNAMENTS, THOST(hostId), id);
    await bumpVersion(env.KAVA_TOURNAMENTS, TVER(id));

    return NextResponse.json({ ok: true, id, href: `/t/${encodeURIComponent(id)}` }, { status: 201 });
  }

  if (type === "list") {
    if (!env.KAVA_LISTS) {
      // If you haven't wired lists KV, fail clearly
      return NextResponse.json({ error: "KV not bound: KAVA_LISTS" }, { status: 500 });
    }
    const hostId =
      body?.hostId ||
      req.headers.get("x-me") ||
      req.headers.get("x-user-id") ||
      "";

    if (!hostId) {
      return NextResponse.json({ error: "Missing hostId" }, { status: 400 });
    }

    const id = uid();
    const doc = {
      id,
      name: body?.name?.trim() || "New List",
      code: (body?.code || "").trim() || undefined,
      hostId,
      status: "active" as const,
      players: [] as { id: string; name: string }[],
      queue: [] as string[],
      tables: [{ a: undefined, b: undefined }],
      createdAt: now,
      updatedAt: now,
      v: 1,
    };

    await env.KAVA_LISTS.put(LKEY(id), JSON.stringify(doc));
    await writeIndex(env.KAVA_LISTS, LHOST(hostId), id);
    await bumpVersion(env.KAVA_LISTS, LVER(id));

    return NextResponse.json({ ok: true, id, href: `/list/${encodeURIComponent(id)}` }, { status: 201 });
  }

  return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
}
