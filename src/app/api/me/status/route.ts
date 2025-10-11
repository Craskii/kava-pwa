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

    // Optional fallback: look at user's latest tournament
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

/* ---------- helpers ---------- */
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

/* ---------- ID normalization ---------- */
const norm = (v: any) => (typeof v === "string" ? v : v?.id || v?.playerId || v?.uid || null);

/* ---------- TOURNAMENT: top-most active match => UP_NEXT ---------- */
function computeStatusFromTournament(t: any, userId: string): {
  phase: "idle" | "queued" | "up_next" | "match_ready",
  position?: number | null,
  tableNumber?: number | null,
  bracketRoundName?: string | null,
  sig?: string
} {
  if (!t) return { phase: "idle" };

  // 0) Respect tables first (if you seat players onto tables)
  const tables = Array.isArray(t.tables) ? t.tables : [];
  for (const tb of tables) {
    const tableNum = tb?.number ?? tb?.id ?? tb?.tableNumber ?? null;
    const current =
      Array.isArray(tb?.players) ? tb.players.map(norm) :
      Array.isArray(tb?.currentPlayers) ? tb.currentPlayers.map(norm) :
      Array.isArray(tb?.currentPlayerIds) ? tb.currentPlayerIds.map(norm) :
      [];
    if (current.some((p: any) => p === userId)) {
      return {
        phase: "match_ready",
        tableNumber: Number(tableNum) || null,
        bracketRoundName: tb?.roundName || t?.roundName || null,
        sig: `T-${tableNum ?? 'x'}`,
      };
    }
  }

  // 1) Use bracket order (rounds/matches)
  const rounds: any[][] = Array.isArray(t.rounds) ? t.rounds : [];
  if (!rounds.length) return { phase: "idle" };

  // current round = first with any undecided match
  const currentRoundIdx = rounds.findIndex(r => Array.isArray(r) && r.some(m => !m?.winner));
  if (currentRoundIdx === -1) return { phase: "idle" }; // tournament done

  const currentRound = rounds[currentRoundIdx];

  // FIRST undecided match (top-most)
  const firstUndecidedIndex = currentRound.findIndex(m => !m?.winner);
  const cur = firstUndecidedIndex >= 0 ? currentRound[firstUndecidedIndex] : null;
  const sig = `R${currentRoundIdx + 1}-M${firstUndecidedIndex + 1}`;

  const a = norm(cur?.a);
  const b = norm(cur?.b);

  if (a === userId || b === userId) {
    return { phase: "up_next", bracketRoundName: `Round ${currentRoundIdx + 1}`, sig };
  }

  const inThisRoundLater = currentRound.some((m, idx) =>
    idx > firstUndecidedIndex && (norm(m?.a) === userId || norm(m?.b) === userId)
  );
  if (inThisRoundLater) return { phase: "queued", sig };

  return { phase: "idle", sig };
}

/* ---------- LIST: seated => MATCH_READY, queue #1 => UP_NEXT ---------- */
function computeStatusFromList(l: any, userId: string) {
  if (!l) return { phase: "idle" as const };

  // seated?
  const tables = Array.isArray(l.tables) ? l.tables : [];
  for (let i = 0; i < tables.length; i++) {
    const tb = tables[i];
    if (norm(tb?.a) === userId || norm(tb?.b) === userId) {
      return { phase: "match_ready" as const, tableNumber: i + 1, sig: `T${i + 1}` };
    }
  }

  // queue / waitlist / line
  const queue =
    (Array.isArray(l.queue) && l.queue.length ? l.queue :
     Array.isArray(l.waitlist) && l.waitlist.length ? l.waitlist :
     Array.isArray(l.line) && l.line.length ? l.line : null);

  if (queue) {
    const arr = queue.map((p: any) => norm(p)).filter(Boolean);
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      const position = idx + 1;
      if (position === 1) return { phase: "up_next" as const, position, sig: "Q1" };
      return { phase: "queued" as const, position, sig: `Q${position}` };
    }
  }

  return { phase: "idle" as const, sig: "idle" };
}
