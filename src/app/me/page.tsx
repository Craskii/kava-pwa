// src/app/api/me/status/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Query params:
 *  - userId (required on first pass; read from localStorage on the client)
 *  - tournamentId (optional but recommended on /t/[id] pages)
 *
 * This route adapts to your existing endpoints so you don't need DB imports here.
 * It fetches:
 *   /api/tournaments?userId=...  (already exists per your /app/me/page.tsx)
 *   /api/t/[id]                  (assumed to exist; otherwise replace fetchTournament)
 */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || "";
    const tournamentId = url.searchParams.get("tournamentId");

    if (!userId) {
      return NextResponse.json({ phase: "idle" }, { status: 200 });
    }

    // If we know the tournament we're on, compute status for *that* id.
    if (tournamentId) {
      const t = await fetchTournament(req, tournamentId);
      const status = computeStatusFromTournament(t, userId);
      return NextResponse.json(status, { status: 200 });
    }

    // Otherwise, pick the most recent tournament the player is in and compute from that.
    const mine = await fetchMine(req, userId); // { hosting, playing }
    const latest = pickLatestTournament([...mine.playing, ...mine.hosting]);
    if (!latest) return NextResponse.json({ phase: "idle" }, { status: 200 });

    const t = await fetchTournament(req, latest.id);
    const status = computeStatusFromTournament(t, userId);
    return NextResponse.json(status, { status: 200 });
  } catch (e) {
    return NextResponse.json({ phase: "idle" }, { status: 200 });
  }
}

/* ---------------- helpers that use your existing APIs ---------------- */

async function fetchMine(req: NextRequest, userId: string): Promise<{ hosting: any[]; playing: any[] }> {
  const base = baseUrl(req);
  const res = await fetch(`${base}/api/tournaments?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
  if (!res.ok) return { hosting: [], playing: [] };
  return res.json();
}

async function fetchTournament(req: NextRequest, tournamentId: string): Promise<any> {
  const base = baseUrl(req);
  // If your tournament route is different, point this to the right one.
  const res = await fetch(`${base}/api/t/${encodeURIComponent(tournamentId)}`, { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

function baseUrl(req: NextRequest): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

function pickLatestTournament(list: any[]): any | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return [...list].sort((a, b) => (Number(b?.createdAt) || 0) - (Number(a?.createdAt) || 0))[0];
}

/**
 * Compute a unified status from various plausible tournament shapes.
 * This is conservative: if we can't prove "up_next" or "match_ready", we return "queued" or "idle".
 */
function computeStatusFromTournament(t: any, userId: string): {
  phase: "idle" | "queued" | "up_next" | "match_ready",
  position?: number | null,
  tableNumber?: number | null,
  bracketRoundName?: string | null
} {
  if (!t) return { phase: "idle" };

  // Try to detect mode
  const mode = (t.mode || t.type || t.kind || "").toString().toUpperCase(); // "LIST" or "TOURNAMENT"

  // ---- Common helpers ----
  const players = Array.isArray(t.players) ? t.players : [];
  const idOf = (p: any) => (typeof p === "string" ? p : p?.id || p?.playerId || p?.uid);

  // tables may be shaped like: [{ number, players: [ids] }] or { currentPlayerIds: [] } etc.
  const tables = Array.isArray(t.tables) ? t.tables : [];

  // A general "queue" if present (List mode usually)
  const queue =
    (Array.isArray(t.queue) && t.queue.length ? t.queue :
    Array.isArray(t.waitlist) && t.waitlist.length ? t.waitlist :
    Array.isArray(t.line) && t.line.length ? t.line : null);

  // --- If user is currently on a table, it's MATCH_READY ---
  for (const tb of tables) {
    const tableNum = tb?.number ?? tb?.id ?? tb?.tableNumber ?? null;
    const current = Array.isArray(tb?.players) ? tb.players
                 : Array.isArray(tb?.currentPlayers) ? tb.currentPlayers
                 : Array.isArray(tb?.currentPlayerIds) ? tb.currentPlayerIds
                 : [];
    if (current.some((p: any) => idOf(p) === userId)) {
      return {
        phase: "match_ready",
        tableNumber: Number(tableNum) || null,
        bracketRoundName: t?.roundName || tb?.roundName || null
      };
    }
  }

  // --- Tournament bracket assignment (matches array) ---
  if (Array.isArray(t.matches)) {
    // Find this user's match; if assigned to a table or marked ready, call it MATCH_READY
    const mine = t.matches.find((m: any) =>
      Array.isArray(m?.players) && m.players.some((p: any) => idOf(p) === userId)
    );
    if (mine) {
      const ready =
        mine?.status?.toUpperCase?.() === "READY" ||
        mine?.state?.toUpperCase?.() === "READY" ||
        mine?.tableNumber != null;

      if (ready) {
        return {
          phase: "match_ready",
          tableNumber: mine?.tableNumber ?? null,
          bracketRoundName: mine?.roundName ?? t?.roundName ?? null
        };
      }
      // If not ready but explicitly next/queued:
      if (mine?.isNext || mine?.upNext) {
        return { phase: "up_next" };
      }
      return { phase: "queued" };
    }
  }

  // --- List/Queue position ---
  if (queue) {
    const arr = queue.map((p: any) => idOf(p));
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      const position = idx + 1;
      if (position === 1) return { phase: "up_next", position };
      return { phase: "queued", position };
    }
  }

  // fallback: if user is in players array but nowhere else, call it queued
  if (players.some((p: any) => idOf(p) === userId)) {
    return { phase: "queued" };
  }

  return { phase: "idle" };
}
