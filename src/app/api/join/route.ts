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
  queue8?: string[];
  queue9?: string[];
  queue?: string[]; // legacy single queue
  prefs?: Record<string, Pref>;
};

/* ---------- keys + helpers ---------- */
const LKEY = (id: string) => `l:${id}`;
const LVER = (id: string) => `lv:${id}`;

function normCode(x: unknown): string {
  const digits = String(x ?? "").replace(/\D+/g, "");
  // keep last 5 digits; pad if shorter (so “974” -> “00974”)
  const last5 = digits.slice(-5).padStart(5, "0");
  return last5;
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

    // Combine queues (prefer 9ft first to avoid starvation, like your server GET)
    let queue: string[] = [];
    if (Array.isArray(raw.queue)) {
      queue = raw.queue.map((x: any) => String(x)).filter(Boolean);
    } else {
      const q9 = Array.isArray(raw.queue9)
        ? raw.queue9.map((x: any) => String(x)).filter(Boolean)
        : [];
      const q8 = Array.isArray(raw.queue8)
        ? raw.queue8.map((x: any) => String(x)).filter(Boolean)
        : [];
      queue = [...q9, ...q8];
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

/* ---------- POST /api/join ---------- */
/** Body: { code: string, name?: string }
 *  Looks up code → listId, adds player (if missing), appends to queue, bumps version
 *  Response: { ok: true, id, href } or 404 {error:"Not found"}
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
  if (!mapping) {
    // No mapping = no such code
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Mapping can be either plain listId (legacy) or JSON with {kind,id}
  let kind: "list" | "tournament" = "list";
  let listId = mapping;
  try {
    const parsed = JSON.parse(mapping);
    if (parsed && typeof parsed === "object" && parsed.id) {
      listId = String(parsed.id);
      if (parsed.kind === "tournament") kind = "tournament";
    }
  } catch {
    /* legacy string; treat as list */
  }

  if (kind !== "list") {
    // For tournaments you'd have a separate join flow; for now, not supported here.
    return NextResponse.json(
      { error: "This code is for a tournament (unsupported here)." },
      { status: 400 }
    );
  }

  // Load list
  const raw = await env.KAVA_TOURNAMENTS.get(LKEY(listId));
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = coerceList(JSON.parse(raw));
  if (!doc || !doc.id) {
    return NextResponse.json({ error: "Corrupt list" }, { status: 500 });
  }

  // Ensure player exists
  // If there’s already a player with same name, keep that; otherwise create new player id
  let player: Player | null =
    doc.players.find((p) => p.name.toLowerCase() === name.toLowerCase()) ||
    null;
  if (!player) {
    player = { id: uid(), name };
    doc.players.push(player);
  }

  // Ensure prefs map and default
  doc.prefs ??= {};
  if (!doc.prefs[player.id]) doc.prefs[player.id] = "any";

  // Ensure in queue (end of queue)
  doc.queue ??= [];
  if (!doc.queue.includes(player.id)) {
    doc.queue.push(player.id);
  }

  // Save doc and bump version
  await env.KAVA_TOURNAMENTS.put(LKEY(doc.id), JSON.stringify(doc));
  const curV = await getV(env, doc.id);
  await setV(env, doc.id, curV + 1);

  // Respond with where the client should navigate
  return NextResponse.json({
    ok: true,
    id: doc.id,
    href: `/list/${encodeURIComponent(doc.id)}`,
  });
}
