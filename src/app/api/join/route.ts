// src/app/api/join/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- KV ---------- */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

/* ---------- Types ---------- */
type Player = { id: string; name: string };

type TableLabel = "8 foot" | "9 foot";
type Table = { a?: string; b?: string; label: TableLabel };
type Pref = "8 foot" | "9 foot" | "any";

type ListGame = {
  id: string; name: string; code?: string; hostId: string;
  status: "active"; createdAt: number;
  tables: Table[]; players: Player[]; queue?: string[];
  prefs?: Record<string, Pref>;
  cohosts?: string[];
};

type Match = { a?: string; b?: string; winner?: string; reports?: Record<string,"win"|"loss"> };
type Tournament = {
  id: string; name: string; code?: string; hostId: string;
  players: Player[]; pending: Player[]; rounds: Match[][];
  status: "setup"|"active"|"completed"; createdAt: number; updatedAt?: number;
  cohosts?: string[];
};

/* ---------- Keys ---------- */
const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;
const LHOST = (hostId: string) => `lidx:h:${hostId}`;
const LPLAY = (pid: string) => `lidx:p:${pid}`;

const TKEY  = (id: string) => `t:${id}`;
const TVER  = (id: string) => `tv:${id}`;
const THOST = (hostId: string) => `tidx:h:${hostId}`;
const TPLAY = (pid: string) => `tidx:p:${pid}`;

/* ---------- utils ---------- */
function uid() {
  try { /* @ts-expect-error */ return crypto.randomUUID(); }
  catch { return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
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
async function getV(env: Env, id: string) {
  const raw = await env.KAVA_TOURNAMENTS.get(LVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(LVER(id), String(v));
}

/* ---------- coercers ---------- */
function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t:any,i:number)=>({
          a: t?.a?String(t.a):undefined,
          b: t?.b?String(t.b):undefined,
          label: (t?.label==="9 foot"||t?.label==="8 foot") ? t.label : (i===1?"9 foot":"8 foot"),
        })) : [{label:"8 foot"},{label:"9 foot"}];

    const players: Player[] = Array.isArray(raw.players)
      ? raw.players.map((p:any)=>({id:String(p?.id ?? ""), name:String(p?.name ?? "Player")}))
      : [];

    const prefs: Record<string,Pref> = {};
    if (raw.prefs && typeof raw.prefs === "object") {
      for (const [pid,v] of Object.entries(raw.prefs)) {
        const s = String(v);
        prefs[pid] = (s==="9 foot"||s==="8 foot"||s==="any") ? (s as Pref) : "any";
      }
    }

    const q = Array.isArray(raw.queue) ? raw.queue.map(String).filter(Boolean) : [];

    return {
      id:String(raw.id ?? ""), name:String(raw.name ?? "Untitled"),
      code: raw.code ? String(raw.code) : undefined,
      hostId:String(raw.hostId ?? ""), status:"active",
      createdAt:Number(raw.createdAt ?? Date.now()),
      tables, players, prefs, cohosts: Array.isArray(raw.cohosts)?raw.cohosts.map(String):[],
      queue:q,
    };
  } catch { return null; }
}
function coerceTournament(raw:any): Tournament | null {
  if (!raw) return null;
  try {
    const players: Player[] = Array.isArray(raw.players) ? raw.players.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const pending: Player[] = Array.isArray(raw.pending) ? raw.pending.map((p:any)=>({id:String(p?.id??""), name:String(p?.name??"Player")})) : [];
    const rounds: Match[][] = Array.isArray(raw.rounds) ? raw.rounds : [];
    const status = (raw.status==="setup"||raw.status==="active"||raw.status==="completed") ? raw.status : "setup";
    return {
      id:String(raw.id ?? ""), name:String(raw.name ?? "Untitled"),
      code: raw.code ? String(raw.code) : undefined,
      hostId:String(raw.hostId ?? ""), players, pending, rounds, status,
      createdAt:Number(raw.createdAt ?? Date.now()), updatedAt:Number(raw.updatedAt ?? Date.now()),
      cohosts: Array.isArray(raw.cohosts) ? raw.cohosts.map(String) : [],
    };
  } catch { return null; }
}

/* ---------- seat for lists ---------- */
function reconcileSeatingList(x: ListGame) {
  const seated = new Set<string>();
  for (const t of x.tables) { if (t.a) seated.add(t.a); if (t.b) seated.add(t.b); }
  const q = x.queue ?? [];
  const prefs = x.prefs ?? {};
  const take = (want: TableLabel): string | undefined => {
    for (let i=0;i<q.length;i++){
      const pid = q[i]; if (!pid || seated.has(pid)) continue;
      const pf = (prefs[pid] ?? "any") as Pref;
      if (pf==="any" || pf===want){ q.splice(i,1); return pid; }
    }
    return undefined;
  };
  for (const t of x.tables) {
    if (!t.a) { const pid = take(t.label); if (pid) { t.a = pid; seated.add(pid); } }
    if (!t.b) { const pid = take(t.label); if (pid) { t.b = pid; seated.add(pid); } }
  }
  x.queue = q;
}

/* ---------- resolve code → {kind,id} ---------- */
async function resolveByCode(env: Env, code: string): Promise<{kind:"list"|"tournament"; id:string} | null> {
  const mapKey = `code:${code}`;
  const mapping = await env.KAVA_TOURNAMENTS.get(mapKey);
  if (!mapping) return null;
  try {
    const parsed = JSON.parse(mapping);
    if (parsed?.id) return { kind: parsed.kind === "tournament" ? "tournament" : "list", id: String(parsed.id) };
  } catch {}
  const id = mapping;
  const [l, t] = await Promise.all([env.KAVA_TOURNAMENTS.get(LKEY(id)), env.KAVA_TOURNAMENTS.get(TKEY(id))]);
  if (l) return { kind: "list", id };
  if (t) return { kind: "tournament", id };
  return null;
}

/* ---------- GET (health) ---------- */
export async function GET() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* ---------- POST (join) ---------- */
export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext(); const env = rawEnv as unknown as Env;

  let body:any=null;
  try { body = await req.json(); } catch { return NextResponse.json({ error:"Bad JSON" },{ status:400 }); }

  const code = normCode(body?.code);
  const meName = String(body?.name ?? "").trim() || "Player";
  const meId = String(body?.userId ?? body?.meId ?? req.headers.get("x-user-id") ?? "").trim();

  if (!code || code.length !== 5) return NextResponse.json({ error:"Invalid code" },{ status:400 });

  const target = await resolveByCode(env, code);
  if (!target) return NextResponse.json({ error:"Not found" },{ status:404 });

  /* ----- LIST ----- */
  if (target.kind === "list") {
    const raw = await env.KAVA_TOURNAMENTS.get(LKEY(target.id));
    if (!raw) return NextResponse.json({ error:"Not found" },{ status:404 });
    const doc = coerceList(JSON.parse(raw));
    if (!doc || !doc.id) return NextResponse.json({ error:"Corrupt list" },{ status:500 });

    const callerIsHost = !!meId && meId === doc.hostId;

    if (!callerIsHost) {
      let me: Player | null =
        (meId && doc.players.find(p=>p.id===meId)) ||
        doc.players.find(p=>p.name.toLowerCase()===meName.toLowerCase()) || null;

      if (!me) { me = { id: meId || uid(), name: meName }; doc.players.push(me); }
      if (!doc.players.some(p=>p.id===me.id)) doc.players.push(me);

      doc.prefs ??= {}; if (!doc.prefs[me.id]) doc.prefs[me.id] = "any";
      doc.queue ??= []; if (!doc.queue.includes(me.id)) doc.queue.push(me.id);

      reconcileSeatingList(doc);

      await env.KAVA_TOURNAMENTS.put(LKEY(doc.id), JSON.stringify(doc));
      const cur = await getV(env, doc.id); await setV(env, doc.id, cur + 1);

      await addTo(env, LPLAY(me.id), doc.id);
    }
    await addTo(env, LHOST(doc.hostId), doc.id);
    return NextResponse.json({ ok:true, kind:"list", id:doc.id, href:`/list/${encodeURIComponent(doc.id)}` });
  }

  /* ----- TOURNAMENT ----- */
  const trRaw = await env.KAVA_TOURNAMENTS.get(TKEY(target.id));
  if (!trRaw) return NextResponse.json({ error:"Not found" },{ status:404 });
  const t = coerceTournament(JSON.parse(trRaw));
  if (!t || !t.id) return NextResponse.json({ error:"Corrupt tournament" },{ status:500 });

  const callerIsHost = !!meId && meId === t.hostId;
  const isCoHost = !!meId && (t.cohosts ?? []).includes(meId);

  if (callerIsHost || isCoHost) {
    await addTo(env, THOST(t.hostId), t.id);
    return NextResponse.json({ ok:true, kind:"tournament", id:t.id, href:`/t/${encodeURIComponent(t.id)}` });
  }

  const already =
    t.players.some(p=>p.id===meId || p.name.toLowerCase()===meName.toLowerCase()) ||
    t.pending.some(p=>p.id===meId || p.name.toLowerCase()===meName.toLowerCase());

  if (!already) {
    const me: Player = { id: meId || uid(), name: meName };
    t.pending.push(me);
    await addTo(env, TPLAY(me.id), t.id); // <-- lets “My tournaments” find it
  }

  t.updatedAt = Date.now();
  await env.KAVA_TOURNAMENTS.put(TKEY(t.id), JSON.stringify(t));
  const tvRaw = await env.KAVA_TOURNAMENTS.get(TVER(t.id));
  const tv = tvRaw ? Number(tvRaw) : 0;
  await env.KAVA_TOURNAMENTS.put(TVER(t.id), String((Number.isFinite(tv)?tv:0) + 1));

  await addTo(env, THOST(t.hostId), t.id);

  return NextResponse.json({ ok:true, kind:"tournament", id:t.id, href:`/t/${encodeURIComponent(t.id)}` });
}
