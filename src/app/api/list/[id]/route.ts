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

type AuditEntry = {
  t: number;                   // timestamp
  who?: string;                // actor id (optional)
  type:
    | "player.add" | "player.remove" | "player.rename"
    | "queue.enqueue" | "queue.dequeue" | "queue.move"
    | "seat.win" | "seat.clear"
    | "role.cohost.set" | "role.cohost.clear"
    | "table.label"
    | "list.rename";
  note?: string;               // free text
};

/** Persisted list model (dual-queue capable, but GET returns combined `queue` for legacy) */
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];             // NOTE: array
  players: Player[];
  queue8: string[];
  queue9: string[];
  prefs?: Record<string, Pref>;
  cohosts?: string[];          // NEW: cohost ids
  audit?: AuditEntry[];        // NEW: rolling audit log
  v?: number;                  // monotonic version (optional)
};

/* keys + helpers */
const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const LPLAYER = (playerId: string) => `lidx:p:${playerId}`;
const LHOST   = (hostId: string)   => `lidx:h:${hostId}`;
const CODEKEY = (code: string) => `code:${code}`;

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

/** Back-compat coercion for incoming JSON */
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
    // legacy single queue → split based on prefs (default 8ft)
    for (const x of doc.queue as any[]) {
      const pid = String(x);
      const pref = prefs[pid] ?? "any";
      if (pref === "9 foot") queue9.push(pid);
      else queue8.push(pid);
    }
  }

  const cohosts: string[] = Array.isArray(doc?.cohosts)
    ? (doc.cohosts as any[]).map(x => String(x)).filter(Boolean)
    : [];

  const audit: AuditEntry[] = Array.isArray(doc?.audit)
    ? (doc.audit as any[]).map(e => ({
        t: Number(e?.t ?? Date.now()),
        who: e?.who ? String(e.who) : undefined,
        type: String(e?.type) as AuditEntry["type"],
        note: e?.note ? String(e.note) : undefined
      })).slice(-200)
    : [];

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
    cohosts,
    audit,
    v: Number.isFinite(doc?.v) ? Number(doc.v) : undefined,
  };
}

/** Outgoing (GET): include combined legacy queue + version */
function coerceOut(stored: any) {
  const x = coerceIn(stored);
  const queue = [...x.queue9, ...x.queue8]; // 9ft first (policy)
  return { ...x, queue, v: Number.isFinite(x.v) ? x.v : undefined };
}

/** Utilities */
function dropFromQueues(x: ListGame, pid?: string) {
  if (!pid) return;
  x.queue8 = x.queue8.filter(id => id !== pid);
  x.queue9 = x.queue9.filter(id => id !== pid);
}
function reconcileSeating(x: ListGame) {
  const seated = new Set<string>();
  for (const t of x.tables) {
    if (t.a) seated.add(t.a);
    if (t.b) seated.add(t.b);
  }
  const nextFrom = (label: "8 foot" | "9 foot") => {
    const src = label === "9 foot" ? x.queue9 : x.queue8;
    while (src.length) {
      const pid = src.shift()!;
      if (!seated.has(pid)) return pid;
    }
    return undefined;
  };
  for (const t of x.tables) {
    if (!t.a) { const pid = nextFrom(t.label); if (pid) { t.a = pid; seated.add(pid); dropFromQueues(x, pid);} }
    if (!t.b) { const pid = nextFrom(t.label); if (pid) { t.b = pid; seated.add(pid); dropFromQueues(x, pid);} }
  }
}

/** Compute audit diffs and append entries */
function auditDiff(prev: ListGame|null, next: ListGame, actor?: string): AuditEntry[] {
  const out: AuditEntry[] = [];
  const now = Date.now();
  const A = (type: AuditEntry["type"], note?: string) => out.push({ t: now, who: actor, type, note });

  // name change
  if (prev && prev.name !== next.name) A("list.rename", `${prev.name} → ${next.name}`);

  // players add/remove + rename
  const pm = new Map(prev?.players.map(p=>[p.id,p.name]) ?? []);
  const nm = new Map(next.players.map(p=>[p.id,p.name]));
  for (const [id, name] of nm) if (!pm.has(id)) A("player.add", `${name} (${id})`);
  for (const [id, name] of pm) if (!nm.has(id)) A("player.remove", `${name} (${id})`);
  for (const [id, name] of nm) {
    const old = pm.get(id);
    if (old && old !== name) A("player.rename", `${old} → ${name} (${id})`);
  }

  // queue diffs (combined view)
  const qPrev = prev ? [...prev.queue9, ...prev.queue8] : [];
  const qNext = [...next.queue9, ...next.queue8];
  const idxPrev = new Map(qPrev.map((pid, i)=>[pid,i]));
  const idxNext = new Map(qNext.map((pid, i)=>[pid,i]));
  for (const pid of qNext) if (!idxPrev.has(pid)) A("queue.enqueue", pid);
  for (const pid of qPrev) if (!idxNext.has(pid)) A("queue.dequeue", pid);
  // detect moves (simple index change for existing pids)
  for (const pid of qNext) {
    if (idxPrev.has(pid)) {
      const a = idxPrev.get(pid)!; const b = idxNext.get(pid)!;
      if (a !== b) A("queue.move", `${pid} ${a}→${b}`);
    }
  }

  // cohost changes
  const coPrev = new Set(prev?.cohosts ?? []);
  const coNext = new Set(next.cohosts ?? []);
  for (const id of coNext) if (!coPrev.has(id)) A("role.cohost.set", id);
  for (const id of coPrev) if (!coNext.has(id)) A("role.cohost.clear", id);

  // table label changes
  const tPrev = prev?.tables ?? [];
  const tNext = next.tables;
  for (let i=0;i<Math.min(tPrev.length,tNext.length);i++){
    if (tPrev[i].label !== tNext[i].label) A("table.label", `Table ${i+1}: ${tPrev[i].label}→${tNext[i].label}`);
  }

  return out.slice(0, 20); // cap per save to protect size
}
function pushAudit(doc: ListGame, entries: AuditEntry[]) {
  doc.audit = [...(doc.audit ?? []), ...entries].slice(-200);
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

/* ---------- PUT/POST (accept legacy; build audit; bump version) ---------- */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;
  const id = params.id;

  // Optional optimistic concurrency
  const ifMatch = req.headers.get("if-match");
  const curV = await getV(env, id);
  if (ifMatch !== null && String(curV) !== String(ifMatch)) {
    return NextResponse.json({ error: "Version conflict" }, { status: 412 });
  }

  const prevRaw = await env.KAVA_TOURNAMENTS.get(LKEY(id));
  const prev = prevRaw ? coerceIn(JSON.parse(prevRaw)) : null;
  const prevPlayers = new Set((prev?.players ?? []).map(p => p.id));

  let body: ListGame;
  try { body = coerceIn(await req.json()); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (body.id !== id) return NextResponse.json({ error: "ID mismatch" }, { status: 400 });

  // server reconcile + version bump
  reconcileSeating(body);
  const nextV = curV + 1;
  body.v = nextV;

  // audit
  const actor = undefined; // (optional) if you attach user id via header/cookie
  pushAudit(body, auditDiff(prev, body, actor));

  await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(body));
  await setV(env, id, nextV);

  // indices: players + host
  const nextPlayers = new Set((body.players ?? []).map(p => p.id));
  for (const p of nextPlayers) if (!prevPlayers.has(p)) await addTo(env, LPLAYER(p), id);
  for (const p of prevPlayers) if (!nextPlayers.has(p)) await removeFrom(env, LPLAYER(p), id);

  if (prev?.hostId && prev.hostId !== body.hostId) await removeFrom(env, LHOST(prev.hostId), id);
  if (body.hostId) await addTo(env, LHOST(body.hostId), id);

  return new NextResponse(null, { status: 204, headers: { "x-l-version": String(nextV), ETag: `"l-${nextV}"` } });
}

/* POST = alias for PUT (used by client micro-batching without If-Match) */
export async function POST(req: Request, ctx: { params: { id: string } }) {
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
      if (doc.code) await env.KAVA_TOURNAMENTS.delete(CODEKEY(doc.code));
      for (const p of (doc.players || [])) await removeFrom(env, LPLAYER(p.id), id);
      if (doc.hostId) await removeFrom(env, LHOST(doc.hostId), id);
    } catch {}
  }

  await env.KAVA_TOURNAMENTS.delete(LKEY(id));
  await env.KAVA_TOURNAMENTS.delete(LVER(id));
  return new NextResponse(null, { status: 204 });
}
