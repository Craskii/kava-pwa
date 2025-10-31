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

const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;

function normCode(x: unknown): string {
  const digits = String(x ?? "").replace(/\D+/g, "");
  return digits.slice(-5).padStart(5, "0");
}

async function getV(env: Env, id: string): Promise<number> {
  const raw = await env.KAVA_TOURNAMENTS.get(LVER(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setV(env: Env, id: string, v: number) {
  await env.KAVA_TOURNAMENTS.put(LVER(id), String(v));
}

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
      ? raw.players.map((p: any) => ({
          id: String(p?.id ?? ""),
          name: String(p?.name ?? "Player"),
        }))
      : [];

    const prefs: Record<string, Pref> = {};
    if (raw.prefs && typeof raw.prefs === "object") {
      for (const [pid, v] of Object.entries(raw.prefs)) {
        const vv = String(v);
        prefs[pid] =
          vv === "9 foot" || vv === "8 foot" || vv === "any"
            ? (vv as Pref)
            : "any";
      }
    }

    // merge queues (your GET does 9ft first — we just keep array order here)
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

function uid() {
  try {
    // @ts-expect-error edge crypto exists
    return crypto.randomUUID();
  } catch {
    return "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Server-side auto-seat: if a seat empty, pop next from queue matching table label (or any) */
function reconcileSeating(x: ListGame) {
  const seated = new Set<string>();
  for (const t of x.tables) {
    if (t.a) seated.add(t.a);
    if (t.b) seated.add(t.b);
  }
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
    if (!t.a) {
      const pid = take(t.label);
      if (pid) {
        t.a = pid;
        seated.add(pid);
      }
    }
    if (!t.b) {
      const pid = take(t.label);
      if (pid) {
        t.b = pid;
        seated.add(pid);
      }
    }
  }

  x.queue = q;
}

/* ---------- POST /api/join ---------- */
/** Body: { code: string, name?: string }
 *  - Resolves code → list id
 *  - Ensures player (with provided name) exists
 *  - Enqueues player (end of queue)
 *  - Server-side auto-seats if any seat is empty
 *  - Bumps version
 *  - Returns { ok, id, href, me } so the client can store local identity
 */
export async function POST(req: Request) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const code = normCode(body?.code);
  const name = String(body?.name ?? "").trim() || "Player";
  if (!code || code.length !== 5) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const mapKey = `code:${code}`;
  const mapping = await env.KAVA_TOURNAMENTS.get(mapKey);
  if (!mapping) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // mapping may be a bare id or a JSON {kind,id}
  let kind: "list" | "tournament" = "list";
  let listId = mapping;
  try {
    const parsed = JSON.parse(mapping);
    if (parsed?.id) {
      listId = String(parsed.id);
      if (parsed.kind === "tournament") kind = "tournament";
    }
  } catch {}

  if (kind !== "list") {
    return NextResponse.json(
      { error: "This code is for a tournament (unsupported here)." },
      { status: 400 }
    );
  }

  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(listId));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = coerceList(JSON.parse(raw));
  if (!doc || !doc.id) return NextResponse.json({ error: "Corrupt list" }, { status: 500 });

  // ensure player exists (reuse same-name if present)
  let me =
    doc.players.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null;
  if (!me) {
    me = { id: uid(), name };
    doc.players.push(me);
  }

  doc.prefs ??= {};
  if (!doc.prefs[me.id]) doc.prefs[me.id] = "any";

  doc.queue ??= [];
  if (!doc.queue.includes(me.id)) doc.queue.push(me.id);

  // seat if there are empty slots
  reconcileSeating(doc);

  await env.KAVA_TOURNAMENTS.put(LKEY(doc.id), JSON.stringify(doc));
  const cur = await getV(env, doc.id);
  await setV(env, doc.id, cur + 1);

  return NextResponse.json({
    ok: true,
    id: doc.id,
    href: `/list/${encodeURIComponent(doc.id)}`,
    me, // {id, name} → client saves to localStorage so the UI shows their name (not "Player")
  });
}
