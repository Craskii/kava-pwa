// src/app/api/me/status/route.ts
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const userId = url.searchParams.get("userId") || "";
    const tournamentId = url.searchParams.get("tournamentId");
    const listId = url.searchParams.get("listId");

    if (!userId) return NextResponse.json({ phase: "idle" }, { status: 200 });

    if (tournamentId) {
      const t = await fetchTournament(req, tournamentId);
      const status = computeStatusFromTournament(t, userId);
      return NextResponse.json(status, { status: 200 });
    }
    if (listId) {
      const l = await fetchList(req, listId);
      const status = computeStatusFromList(l, userId);
      return NextResponse.json(status, { status: 200 });
    }

    // Fallback to latest tournament first, then list (if you later expose a "my lists" API)
    const mineT = await fetchMineTournaments(req, userId);
    const latestT = pickLatest([...mineT.playing, ...mineT.hosting]);
    if (latestT) {
      const t = await fetchTournament(req, latestT.id);
      const status = computeStatusFromTournament(t, userId);
      if (status.phase !== "idle") return NextResponse.json(status, { status: 200 });
    }

    return NextResponse.json({ phase: "idle" }, { status: 200 });
  } catch {
    return NextResponse.json({ phase: "idle" }, { status: 200 });
  }
}

/* ---------- helpers using your existing endpoints ---------- */
const baseUrl = (req: NextRequest) => req.nextUrl.origin;

async function fetchMineTournaments(req: NextRequest, userId: string): Promise<{ hosting: any[]; playing: any[] }> {
  const res = await fetch(`${baseUrl(req)}/api/tournaments?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
  if (!res.ok) return { hosting: [], playing: [] };
  return res.json();
}

async function fetchTournament(req: NextRequest, tournamentId: string): Promise<any> {
  const res = await fetch(`${baseUrl(req)}/api/tournament/${encodeURIComponent(tournamentId)}`, { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

async function fetchList(req: NextRequest, listId: string): Promise<any> {
  const res = await fetch(`${baseUrl(req)}/api/list/${encodeURIComponent(listId)}`, { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

function pickLatest(list: any[]): any | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return [...list].sort((a, b) => (Number(b?.createdAt) || 0) - (Number(a?.createdAt) || 0))[0];
}

/* ---------- status calculators ---------- */
const idOf = (p: any) => (typeof p === "string" ? p : p?.id || p?.playerId || p?.uid);

/**
 * TOURNAMENT RULES (what you asked for):
 * - If user is seated at a table: MATCH_READY (sound if visible + banner)
 * - Else, find current round (earliest round with any undecided match).
 *   - Find FIRST undecided match (top-most, left-to-right in your UI).
 *   - If the user is one of the two players in that match: UP_NEXT (sound + banner).
 *   - Everyone else is QUEUED/IDLE.
 */
function computeStatusFromTournament(t: any, userId: string): {
  phase: "idle" | "queued" | "up_next" | "match_ready",
  position?: number | null,
  tableNumber?: number | null,
  bracketRoundName?: string | null
} {
  if (!t) return { phase: "idle" };

  // 0) If your tournaments seat onto tables, respect that first
  const tables = Array.isArray(t.tables) ? t.tables : [];
  for (const tb of tables) {
    const tableNum = tb?.number ?? tb?.id ?? tb?.tableNumber ?? null;
    const current = Array.isArray(tb?.players) ? tb.players
                 : Array.isArray(tb?.currentPlayers) ? tb.currentPlayers
                 : Array.isArray(tb?.currentPlayerIds) ? tb.currentPlayerIds
                 : [];
    if (current.some((p: any) => idOf(p) === userId)) {
      return { phase: "match_ready", tableNumber: Number(tableNum) || null, bracketRoundName: tb?.roundName || t?.roundName || null };
    }
  }

  // 1) Otherwise, use bracket order (your rounds/matches structure)
  const rounds: any[][] = Array.isArray(t.rounds) ? t.rounds : [];
  if (!rounds.length) return { phase: "idle" };

  // current round = first round with at least one undecided match
  const currentRoundIdx = rounds.findIndex(r => Array.isArray(r) && r.some(m => !m?.winner));
  if (currentRoundIdx === -1) return { phase: "idle" }; // no undecided matches → tournament likely completed

  const currentRound = rounds[currentRoundIdx];

  // the "current" match is the FIRST undecided (top-most in your UI)
  const firstUndecidedIndex = currentRound.findIndex(m => !m?.winner);
  const currentMatch = firstUndecidedIndex >= 0 ? currentRound[firstUndecidedIndex] : null;

  // If the user is in the current match => "up_next"
  if (currentMatch && (currentMatch.a === userId || currentMatch.b === userId)) {
    return { phase: "up_next", bracketRoundName: `Round ${currentRoundIdx + 1}` };
  }

  // If the user is in the same round but a later match, they are queued.
  const inThisRoundLater = currentRound.some((m, idx) =>
    idx > firstUndecidedIndex && (m?.a === userId || m?.b === userId)
  );
  if (inThisRoundLater) return { phase: "queued" };

  // Else idle (they may be eliminated or not participating)
  return { phase: "idle" };
}

/**
 * LIST RULES:
 * - If user is seated at any table (a/b): MATCH_READY
 * - Else if user is #1 in queue: UP_NEXT
 * - Else if user is further back: QUEUED
 * - Else: IDLE
 */
function computeStatusFromList(l: any, userId: string) {
  if (!l) return { phase: "idle" as const };

  // seated?
  const tables = Array.isArray(l.tables) ? l.tables : [];
  for (let i = 0; i < tables.length; i++) {
    const tb = tables[i];
    if (tb?.a === userId || tb?.b === userId) {
      return { phase: "match_ready" as const, tableNumber: i + 1 };
    }
  }

  // queue position
  const queue =
    (Array.isArray(l.queue) && l.queue.length ? l.queue :
     Array.isArray(l.waitlist) && l.waitlist.length ? l.waitlist :
     Array.isArray(l.line) && l.line.length ? l.line : null);

  if (queue) {
    const arr = queue.map((p: any) => idOf(p));
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      const position = idx + 1;
      if (position === 1) return { phase: "up_next" as const, position };
      return { phase: "queued" as const, position };
    }
  }

  return { phase: "idle" as const };
}
