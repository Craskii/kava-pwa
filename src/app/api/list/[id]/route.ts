// src/app/api/list/[id]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* KV + types */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type Table = { a?: string; b?: string; label: "8 foot" | "9 foot" };
type Player = { id: string; name: string };
type Pref = "8 foot" | "9 foot" | "any";

/** Persisted list model (dual-queue + prefs) */
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];        // <-- FIXED: it must be an array
  players: Player[];
  queue8: string[];       // 8-foot queue
  queue9: string[];       // 9-foot queue
  prefs?: Record<string, Pref>;
  v?: number;             // client-supplied version (optional)
};

/* keys + helpers */
const LKEY   = (id: string) => `l:${id}`;
const LVER   = (id: string) => `lv:${id}`;
const LPLAYER= (playerId: string) => `lidx:p:${playerId}`;
const LHOST  = (hostId: string)   => `lidx:h:${hostId}`;

async function getV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(LVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(LVER(id), String(v));
}
async function readArr(env: Env, key: string): Promise<string[]> {
  const raw = (await env.KAVA_TOURNAMENTS.get(key)) || "[]";
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
async function writeArr(env: Env, key: string, arr: string[]) {
  await env.KAVA_TOURNAMENTS.put(key, JSON.stringify(arr));
}
async function addTo(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  if (!arr.includes(id)) { arr.push(id); await writeArr(env, key, arr); }
}
async function removeFrom(env: Env, key: string, id: string) {
  const arr = await readArr(env, key);
  const next = arr.filter(x => x !== id);
  if (next.length !== arr.length) await writeArr(env, key, next);
}

/** Back-compat coercion for incoming JSON:
 *  - Accepts legacy single-queue {queue, prefs}
 *  - Accepts new model {queue8, queue9, prefs}
 *  - Normalizes tables & players
 */
function coerceIn(doc: any): ListGame {
  const players: Player[] = Array.isArray(doc?.players)
    ? doc.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") }))
    : [];

  const tables: Table[] = Array.isArray(doc?.tables)
    ? doc.tables.map((t: any, i: number) => ({
        a: t?.a ? String(t.a) : undefined,
        b: t?.b ? String(t.b) : undefined,
        label: (t?.label === "9 foot" || t?.label === "8 foot")
          ? t.label
          : (i === 1 ? "9 foot" : "8 foot")
      }))
    : [{ label: "8 foot" }, { label: "9 foot" }];

  const prefs: Record<string, Pref> = {};
  if (doc?.prefs && typeof doc.prefs === "object") {
    for (const [pid, v] of Object.entries(doc.prefs)) {
      prefs[String(pid)] = (v === "8 foot" || v === "9 foot" || v === "any") ? (v as Pref) : "any";
    }
  }

  let queue8: string[] = [];
  let queue9: string[] = [];

  if (Array.isArray(doc?.queue8) || Array.isArray(doc?.queue9)) {
    queue8 = (doc?.queue8 ?? []).map((x: any) => String(x)).filter(Boolean);
    queue9 = (doc?.queue9 ?? []).map((x: any) => String(x)).filter(Boolean);
  } else if (Array.isArray(doc?.queue)) {
    // legacy: split single queue according to prefs; default to 8-foot if pref not 9
    for (const x of doc.queue as any[]) {
      const pid = String(x);
      const pref = prefs[pid] ?? "any";
      if (pref === "9 foot") queue9.push(pid);
      else queue8.push(pid);
    }
  }

  return {
    id: String(doc?.id ?? ""),
    name: String(doc?.name ?? "Untitled"),
    code: doc?.code ? String(doc.code) : undefined,
    hostId: String(doc?.hostId ?? ""),
    status: "active",
    createdAt: Number(doc?.createdAt ?? Date.now()),
    tables,
    players,
    queue8,
    queue9,
    prefs,
    v: Number.isFinite(doc?.v) ? Number(doc.v) : undefined,
  };
}

/** Coercion for OUTGOING (GET) to keep legacy clients happy:
 *  - Return combined `queue` along with stored `queue8/queue9`
 */
function coerceOut(stored: any) {
  const x = coerceIn(stored);
  const queue = [...x.queue9, ...x.queue8]; // simple concat (9-ft first)
  return { ...x, queue };
}

/** Utility: remove a player id from both queues */
function dropFromQueues(x: ListGame, pid?: string) {
  if (!pid) return;
  x.queue8 = x.queue8.filter(id => id !== pid);
  x.queue9 = x.queue9.filter(id => id !== pid);
}

/** Server-side reconcile:
 *  - If a seat is empty, pull next from the matching queue (by table label)
 *  - Ensure players aren’t seated twice
 *  - When seated, remove from both queues
 */
function reconcileSeating(x: ListGame) {
  const seated = new Set<string>();
  for (const t of x.tables) {
    if (t.a) seated.add(t.a);
    if (t.b) seated.add(t.b);
  }

  function nextFrom(label: "8 foot" | "9 foot"): string | undefined {
    const src = label === "9 foot" ? x.queue9 : x.queue8;
    while (src.length) {
      const pid = src.shift()!;
      if (!seated.has(pid)) return pid;
    }
    return undefined;
  }

  for (const t of x.tables) {
    if (!t.a) {
      const pid = nextFrom(t.label);
      if (pid) { t.a = pid; seated.add(pid); dropFromQueues(x, pid); }
    }
    if (!t.b) {
      const pid = nextFrom(t.label);
      if (pid) { t.b = pid; seated.add(pid); dropFromQueues(x, pid); }
    }
  }
}

/* ---------- GET (ETag/304) ---------- */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const v = await getV(env, id);
  const etag = `"l-${v}"`;
  const inm = req.headers.get("if-none-match");
  if (inm && inm === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
        "x-l-version": String(v),
      }
    });
  }

  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const out = coerceOut(JSON.parse(raw));
  const serialized = JSON.stringify(out);

  return new NextResponse(serialized, {
    headers: {
      "content-type": "application/json",
      ETag: etag,
      "Cache-Control": "public, max-age=0, stale-while-revalidate=30",
      "x-l-version": String(v),
    }
  });
}

/* ---------- PUT (If-Match; tolerant fallback) ---------- */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const curV = await getV(env, id);

  let bodyRaw: any;
  try { bodyRaw = await req.json(); }
  catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const incoming = coerceIn(bodyRaw);
  if (incoming.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  // Version gate:
  const ifMatch = req.headers.get("if-match");
  const incomingV = Number(bodyRaw?.v ?? incoming.v ?? 0);

  const strictMismatch = (ifMatch !== null && String(curV) !== String(ifMatch));
  const tolerantOk    = (ifMatch === null && Number.isFinite(incomingV) && incomingV >= curV);

  if (strictMismatch && !tolerantOk) {
    return NextResponse.json({ error: "Version conflict" }, { status: 412 });
  }

  // read previous for indices (before overwrite)
  const prevRaw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  const prev = prevRaw ? coerceIn(JSON.parse(prevRaw)) : null;
  const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));

  // Always reconcile before save
  reconcileSeating(incoming);

  await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(incoming));
  const nextV = curV + 1;
  await setV(env, id, nextV);

  // indices: players + host
  const nextPlayers = new Set((incoming.players ?? []).map(p => p.id));
  for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(env, LPLAYER(p), id);
  for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(env, LPLAYER(p), id);

  if (prev?.hostId && prev.hostId !== incoming.hostId) await removeFrom(env, LHOST(prev.hostId), id);
  if (incoming.hostId) await addTo(env, LHOST(incoming.hostId), id);

  return new NextResponse(null, { status: 204, headers: { "x-l-version": String(nextV), ETag: `"l-${nextV}"` } });
}

/* ---------- POST (alias for PUT; for keepalive/sendBeacon) ---------- */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  // sendBeacon can't set headers like If-Match; PUT above tolerates when body.v >= currentV
  return PUT(req, ctx);
}

/* ---------- DELETE ---------- */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  if (raw) {
    try {
      const doc = coerceIn(JSON.parse(raw));
      if (doc.code) await env.KAVA_TOURNAMENTS.delete(`code:${doc.code}`);
      for (const p of (doc.players || [])) await removeFrom(env, LPLAYER(p.id), id);
      if (doc.hostId) await removeFrom(env, LHOST(doc.hostId), id);
    } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(LKEY(id));
  await env.KAVA_TOURNAMENTS.delete(LVER(id));
  return new NextResponse(null, { status: 204 });
}
