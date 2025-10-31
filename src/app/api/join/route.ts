// src/app/api/join/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* ---------- KV + types ---------- */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

type TableLabel = "8 foot" | "9 foot";
type Table = { a?: string; b?: string; label: TableLabel };
type Player = { id: string; name: string };
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

type Tournament = {
  id: string;
  name: string;
  code?: string;
  hostId: string;
  createdAt: number;
  status?: "setup" | "active" | "completed";
  players: Player[];
  pending?: Player[];
  rounds?: any[];
  coHosts?: string[];
};

const LKEY   = (id: string) => `l:${id}`;
const LVER   = (id: string) => `lv:${id}`;
const LPLAY  = (pid: string) => `lidx:p:${pid}`;

const TKEY   = (id: string) => `t:${id}`;
const TVER   = (id: string) => `tv:${id}`;
const TPLAY  = (pid: string) => `tidx:p:${pid}`;

function normCode(x: unknown): string {
  const digits = String(x ?? "").replace(/\D+/g, "");
  return digits.slice(-5).padStart(5, "0");
}

async function getV(env: Env, key: (id: string) => string, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(key(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, key: (id: string) => string, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(key(id), String(v));
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

function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t: any, i: number) => ({
          a: t?.a ? String(t.a) : undefined,
          b: t?.b ? String(t.b) : undefined,
          label: t?.label === "9 foot" || t?.label === "8 foot"
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
        prefs[pid] = vv === "9 foot" || vv === "8 foot" || vv === "any" ? (vv as Pref) : "any";
      }
    }

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
      tables, players, queue, prefs,
    };
  } catch {
    return null;
  }
}

function uid() {
  try {
    // @ts-expect-error edge crypto exists
    return crypto.randomUUID();
  } catch {
    return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Server-side auto-seat for lists */
function reconcileSeating(x: ListGame) {
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

/* ---------- POST /api/join ---------- */
/** Body: { code, name? }  OR  { code, player:{id,name} } */
export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: any = null;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const code = normCode(body?.code);
  if (!code || code.length !== 5) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  // incoming player
  let incoming: Player;
  if (body?.player?.id && body?.player?.name) {
    incoming = { id: String(body.player.id), name: String(body.player.name).trim() || "Player" };
  } else {
    const nm = String(body?.name ?? "").trim() || "Player";
    incoming = { id: uid(), name: nm };
  }
  const incomingNameLC = incoming.name.toLowerCase();

  // lookup code mapping
  const mapped = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!mapped) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let roomType: "list" | "tournament" = "list";
  let roomId = mapped;
  try {
    const x = JSON.parse(mapped);
    if (x?.id) {
      roomId = String(x.id);
      const t = (x.type || x.kind || "list").toString();
      roomType = (t === "tournament" || t === "tour" || t === "t") ? "tournament" : "list";
    }
  } catch {}

  /* ---------- LISTS ---------- */
  if (roomType === "list") {
    const raw = await env.KAVA_TOURNAMENTS.get(LKEY(roomId));
    if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const doc = coerceList(JSON.parse(raw));
    if (!doc?.id) return NextResponse.json({ error: "Corrupt list" }, { status: 500 });

    // identify host player (by hostId, fallback by name)
    const hostPlayer = doc.players.find(p => p.id === doc.hostId)
      ?? doc.players.find(p => p.name.toLowerCase() === incomingNameLC)
      ?? null;

    // If incoming matches host (id or same name), reuse host identity and DO NOT mutate doc
    if (hostPlayer && (incoming.id === doc.hostId || hostPlayer.name.toLowerCase() === incomingNameLC)) {
      // make sure host is indexed for "My lists"
      await addTo(env, LPLAY(doc.hostId), doc.id);

      return NextResponse.json({
        ok: true, type: "list", id: doc.id,
        href: `/list/${encodeURIComponent(doc.id)}`,
        me: { id: doc.hostId, name: hostPlayer.name },
      });
    }

    // Otherwise, reuse existing player by id or by name; else add
    let me =
      doc.players.find(p => p.id === incoming.id)
      ?? doc.players.find(p => p.name.toLowerCase() === incomingNameLC)
      ?? null;

    if (!me) {
      me = { id: incoming.id, name: incoming.name };
      doc.players.push(me);
    }

    await addTo(env, LPLAY(me.id), doc.id);

    doc.prefs ??= {};
    if (!doc.prefs[me.id]) doc.prefs[me.id] = "any";
    doc.queue ??= [];
    if (!doc.queue.includes(me.id)) doc.queue.push(me.id);

    reconcileSeating(doc);

    await env.KAVA_TOURNAMENTS.put(LKEY(doc.id), JSON.stringify(doc));
    const cur = await getV(env, LVER, doc.id);
    await setV(env, LVER, doc.id, cur + 1);

    return NextResponse.json({
      ok: true, type: "list", id: doc.id,
      href: `/list/${encodeURIComponent(doc.id)}`,
      me
    });
  }

  /* ---------- TOURNAMENTS ---------- */
  const traw = await env.KAVA_TOURNAMENTS.get(TKEY(roomId));
  if (!traw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let t: Tournament;
  try { t = JSON.parse(traw) as Tournament; } catch {
    return NextResponse.json({ error: "Corrupt tournament" }, { status: 500 });
  }

  t.players = Array.isArray(t.players) ? t.players : [];
  t.pending = Array.isArray(t.pending) ? t.pending : [];

  const hostById = t.players.find(p => p.id === t.hostId) ?? null;
  const hostByName = t.players.find(p => p.name.toLowerCase() === incomingNameLC) ?? null;
  const matchesHost = (incoming.id === t.hostId) || (!!hostByName && hostByName.id === t.hostId);

  // Host joining with code → do nothing, just index + return
  if (matchesHost) {
    await addTo(env, TPLAY(t.hostId), t.id);
    return NextResponse.json({
      ok: true, type: "tournament", id: t.id,
      href: `/t/${encodeURIComponent(t.id)}`,
      me: { id: t.hostId, name: (hostById?.name ?? hostByName?.name ?? "Host") }
    });
  }

  // Reuse existing player by id or by name, else add (pending if you gate with approvals)
  let me =
    t.players.find(p => p.id === incoming.id)
    ?? t.players.find(p => p.name.toLowerCase() === incomingNameLC)
    ?? t.pending.find(p => p.id === incoming.id)
    ?? t.pending.find(p => p.name.toLowerCase() === incomingNameLC)
    ?? null;

  if (!me) {
    // default: use pending when status uses approvals
    if (t.status === "setup" || t.status === "active" || typeof t.pending !== "undefined") {
      me = { id: incoming.id, name: incoming.name };
      t.pending.push(me);
    } else {
      me = { id: incoming.id, name: incoming.name };
      t.players.push(me);
    }
  }

  await addTo(env, TPLAY(me.id), t.id);

  await env.KAVA_TOURNAMENTS.put(TKEY(t.id), JSON.stringify(t));
  const curT = await getV(env, TVER, t.id);
  await setV(env, TVER, t.id, curT + 1);

  return NextResponse.json({
    ok: true, type: "tournament", id: t.id,
    href: `/t/${encodeURIComponent(t.id)}`,
    me
  });
}
