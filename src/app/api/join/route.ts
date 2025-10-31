// src/app/api/join/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- KV + types ---------- */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* Shared */
type Player = { id: string; name: string };

function uid() {
  try {
    // @ts-expect-error edge crypto exists
    return crypto.randomUUID();
  } catch {
    return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
function normCode(x: unknown): string {
  const digits = String(x ?? "").replace(/\D+/g, "");
  return digits.slice(-5).padStart(5, "0");
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

/* ---------- LIST shapes ---------- */
type TableLabel = "8 foot" | "9 foot";
type Table = { a?: string; b?: string; label: TableLabel };
type Pref = "8 foot" | "9 foot" | "any";
type ListGame = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  status: "active";
  createdAt: number;
  tables: Table[];
  players: Player[];
  queue?: string[];
  queue8?: string[];
  queue9?: string[];
  prefs?: Record<string, Pref>;
};
const LKEY  = (id: string) => `l:${id}`;
const LVER  = (id: string) => `lv:${id}`;
const LHOST = (hostId: string) => `lidx:h:${hostId}`;   // string[]
const LPLAY = (pid: string)   => `lidx:p:${pid}`;       // string[]

function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t: any, i: number) => ({
          a: t?.a ? String(t.a) : undefined,
          b: t?.b ? String(t.b) : undefined,
          label:
            t?.label === "9 foot" || t?.label === "8 foot"
              ? (t.label as TableLabel)
              : (i === 1 ? "9 foot" : "8 foot"),
        }))
      : [{ label: "8 foot" }, { label: "9 foot" }];

    const players: Player[] = Array.isArray(raw.players)
      ? raw.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") }))
      : [];

    const prefs: Record<string, Pref> = {};
    if (raw.prefs && typeof raw.prefs === "object") {
      for (const [pid, v] of Object.entries(raw.prefs)) {
        const vv = String(v);
        prefs[pid] = (vv === "9 foot" || vv === "8 foot" || vv === "any") ? (vv as Pref) : "any";
      }
    }

    // merge queues
    let queue: string[] = [];
    if (Array.isArray(raw.queue)) {
      queue = raw.queue.map((x: any) => String(x)).filter(Boolean);
    } else {
      const q9 = Array.isArray(raw.queue9) ? raw.queue9 : [];
      const q8 = Array.isArray(raw.queue8) ? raw.queue8 : [];
      queue = [...q9, ...q8].map((x: any) => String(x)).filter(Boolean);
    }

    return {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? "Untitled"),
      code: raw.code ? String(raw.code) : undefined,
      hostId: String(raw.hostId ?? ""),
      status: "active",
      createdAt: Number(raw.createdAt ?? Date.now()),
      tables,
      players,
      queue,
      prefs,
    };
  } catch {
    return null;
  }
}

async function getLV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(LVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setLV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(LVER(id), String(v));
}

/** server-side auto-seat for lists */
function reconcileSeatingList(x: ListGame) {
  const seated = new Set<string>();
  for (const t of x.tables) { if (t.a) seated.add(t.a); if (t.b) seated.add(t.b); }
  const q = x.queue ?? [];
  const prefs = x.prefs ?? {};

  const take = (want: TableLabel): string | undefined => {
    for (let i = 0; i < q.length; i++) {
      const pid = q[i];
      if (!pid || seated.has(pid)) continue;
      const pf = (prefs[pid] ?? "any") as Pref;
      if (pf === "any" || pf === want) {
        q.splice(i, 1);
        return pid;
      }
    }
    return undefined;
  };

  for (const t of x.tables) {
    if (!t.a) { const pid = take(t.label); if (pid) { t.a = pid; seated.add(pid); } }
    if (!t.b) { const pid = take(t.label); if (pid) { t.b = pid; seated.add(pid); } }
  }
  x.queue = q;
}

/* ---------- TOURNAMENT shapes ---------- */
type Match = { a?: string; b?: string; winner?: string; reports?: Record<string,"win"|"loss"> };
type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  players: Player[];
  pending: Player[];
  rounds: Match[][];
  status: "setup" | "active" | "completed";
  createdAt: number;
  updatedAt?: number;
  coHosts?: string[];
};
const TKEY  = (id: string) => `t:${id}`;
const TVER  = (id: string) => `tv:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`;   // string[]
const TPLAY = (pid: string)   => `tidx:p:${pid}`;       // string[]

async function getTV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(TVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setTV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(TVER(id), String(v));
}

function coerceTournament(raw: any): Tournament | null {
  if (!raw) return null;
  try {
    const players: Player[] = Array.isArray(raw.players)
      ? raw.players.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")}))
      : [];
    const pending: Player[] = Array.isArray(raw.pending)
      ? raw.pending.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")}))
      : [];
    const rounds: Match[][] = Array.isArray(raw.rounds)
      ? raw.rounds.map((r:any)=>Array.isArray(r)?r.map((m:any)=>({
          a: m?.a ? String(m.a) : undefined,
          b: m?.b ? String(m.b) : undefined,
          winner: m?.winner ? String(m.winner) : undefined,
          reports: typeof m?.reports==="object" && m?.reports ? m.reports : {}
        })) : [])
      : [];
    const status = (raw.status === "setup" || raw.status === "active" || raw.status === "completed") ? raw.status : "setup";

    return {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? "Untitled"),
      code: raw.code ? String(raw.code) : undefined,
      hostId: String(raw.hostId ?? ""),
      players,
      pending,
      rounds,
      status,
      createdAt: Number(raw.createdAt ?? Date.now()),
      updatedAt: Number(raw.updatedAt ?? Date.now()),
      coHosts: Array.isArray(raw.coHosts) ? raw.coHosts.map(String) : [],
    };
  } catch {
    return null;
  }
}

/* ---------- POST /api/join ---------- */
/** Body: { code: string, name?: string, meId?: string }
 *  - Resolves code → {kind,id}
 *  - For lists: ensure player exists, enqueue (except host), reconcile seats, bump version, update indices
 *  - For tournaments: ensure player exists; if not host/cohost, push to pending (or players if in setup), bump version, update indices
 *  - Returns { ok, kind, id, href, me }
 */
export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: any = null;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const code = normCode(body?.code);
  const meName = String(body?.name ?? "").trim() || "Player";
  const meIdFromBody = String(body?.meId ?? "") || "";
  const meIdFromHeader = req.headers.get("x-user-id") || "";
  const meId = (meIdFromBody || meIdFromHeader || "").trim(); // use if client sends it

  if (!code || code.length !== 5) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  // code mapping can be a plain id or JSON {kind,id}
  const mapKey = `code:${code}`;
  const mapping = await env.KAVA_TOURNAMENTS.get(mapKey);
  if (!mapping) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let kind: "list" | "tournament" = "list";
  let entityId = mapping;
  try {
    const parsed = JSON.parse(mapping);
    if (parsed?.id) {
      entityId = String(parsed.id);
      if (parsed.kind === "tournament") kind = "tournament";
      else kind = "list";
    }
  } catch {}

  if (kind === "list") {
    /* ------------ LIST JOIN ------------ */
    const raw = await env.KAVA_TOURNAMENTS.get(LKEY(entityId));
    if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const doc = coerceList(JSON.parse(raw));
    if (!doc || !doc.id) return NextResponse.json({ error: "Corrupt list" }, { status: 500 });

    // Reuse host identity if caller is host
    const callerIsHost = !!meId && meId === doc.hostId;

    // Find or create player
    let me: Player | null = null;
    if (callerIsHost) {
      me = doc.players.find(p => p.id === doc.hostId) || { id: doc.hostId, name: (doc.players.find(p=>p.id===doc.hostId)?.name || meName) };
      if (!doc.players.some(p => p.id === me!.id)) doc.players.push(me!);
    } else {
      me =
        (meId && doc.players.find(p => p.id === meId)) ||
        doc.players.find(p => p.name.toLowerCase() === meName.toLowerCase()) ||
        null;
      if (!me) { me = { id: meId || uid(), name: meName }; doc.players.push(me); }
    }

    doc.prefs ??= {};
    if (!doc.prefs[me.id]) doc.prefs[me.id] = "any";

    // Enqueue only if not host
    doc.queue ??= [];
    if (!callerIsHost && !doc.queue.includes(me.id)) doc.queue.push(me.id);

    // Seat open spots
    reconcileSeatingList(doc);

    // Save + bump version
    await env.KAVA_TOURNAMENTS.put(LKEY(doc.id), JSON.stringify(doc));
    const cur = await getLV(env, doc.id); await setLV(env, doc.id, cur + 1);

    // Update indices so "My lists" works
    await addTo(env, LHOST(doc.hostId), doc.id);
    await addTo(env, LPLAY(me.id), doc.id);

    return NextResponse.json({
      ok: true,
      kind: "list",
      id: doc.id,
      href: `/list/${encodeURIComponent(doc.id)}`,
      me
    });
  }

  /* ------------ TOURNAMENT JOIN ------------ */
  const trRaw = await env.KAVA_TOURNAMENTS.get(TKEY(entityId));
  if (!trRaw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = coerceTournament(JSON.parse(trRaw));
  if (!t || !t.id) return NextResponse.json({ error: "Corrupt tournament" }, { status: 500 });

  const callerIsHost = !!meId && meId === t.hostId;
  const isCoHost = !!meId && (t.coHosts ?? []).includes(meId);

  // Find or create player record (preserve host if caller is host)
  let me: Player | null = null;
  if (callerIsHost) {
    me = t.players.find(p => p.id === t.hostId) || { id: t.hostId, name: (t.players.find(p=>p.id===t.hostId)?.name || meName) };
    if (!t.players.some(p => p.id === me!.id)) t.players.push(me!);
  } else {
    me =
      (meId && (t.players.find(p => p.id === meId) || t.pending.find(p => p.id === meId))) ||
      t.players.find(p => p.name.toLowerCase() === meName.toLowerCase()) ||
      t.pending.find(p => p.name.toLowerCase() === meName.toLowerCase()) ||
      null;
    if (!me) me = { id: meId || uid(), name: meName };
    // Add to players (setup) or pending (active); cohosts/host go straight to players
    if (t.status === "setup" || callerIsHost || isCoHost) {
      if (!t.players.some(p => p.id === me!.id)) t.players.push(me!);
      t.pending = t.pending.filter(p => p.id !== me!.id);
    } else {
      if (!t.pending.some(p => p.id === me!.id) && !t.players.some(p => p.id === me!.id)) t.pending.push(me!);
    }
  }

  // Save + bump version
  t.updatedAt = Date.now();
  await env.KAVA_TOURNAMENTS.put(TKEY(t.id), JSON.stringify(t));
  const tv = await getTV(env, t.id); await setTV(env, t.id, tv + 1);

  // Update indices so "My tournaments" works
  await addTo(env, THOST(t.hostId), t.id);
  await addTo(env, TPLAY(me.id), t.id);

  return NextResponse.json({
    ok: true,
    kind: "tournament",
    id: t.id,
    href: `/t/${encodeURIComponent(t.id)}`,
    me
  });
}
