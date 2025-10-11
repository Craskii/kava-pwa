import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || "";
    const tournamentId = url.searchParams.get("tournamentId");

    if (!userId) return NextResponse.json({ phase: "idle" }, { status: 200 });

    if (tournamentId) {
      const t = await fetchTournament(req, tournamentId);
      const status = computeStatusFromTournament(t, userId);
      return NextResponse.json(status, { status: 200 });
    }

    const mine = await fetchMine(req, userId);
    const latest = pickLatestTournament([...mine.playing, ...mine.hosting]);
    if (!latest) return NextResponse.json({ phase: "idle" }, { status: 200 });

    const t = await fetchTournament(req, latest.id);
    const status = computeStatusFromTournament(t, userId);
    return NextResponse.json(status, { status: 200 });
  } catch {
    return NextResponse.json({ phase: "idle" }, { status: 200 });
  }
}

/* ---------- helpers using your existing endpoints ---------- */
function baseUrl(req: NextRequest): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

async function fetchMine(req: NextRequest, userId: string): Promise<{ hosting: any[]; playing: any[] }> {
  const res = await fetch(`${baseUrl(req)}/api/tournaments?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
  if (!res.ok) return { hosting: [], playing: [] };
  return res.json();
}
async function fetchTournament(req: NextRequest, tournamentId: string): Promise<any> {
  const res = await fetch(`${baseUrl(req)}/api/tournament/${encodeURIComponent(tournamentId)}`, { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

function pickLatestTournament(list: any[]): any | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return [...list].sort((a, b) => (Number(b?.createdAt) || 0) - (Number(a?.createdAt) || 0))[0];
}

function computeStatusFromTournament(t: any, userId: string): {
  phase: "idle" | "queued" | "up_next" | "match_ready",
  position?: number | null,
  tableNumber?: number | null,
  bracketRoundName?: string | null
} {
  if (!t) return { phase: "idle" };

  // Try “tables”, “matches”, “queue/waitlist/line”, “players”
  const idOf = (p: any) => (typeof p === "string" ? p : p?.id || p?.playerId || p?.uid);

  // 1) On table?
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

  // 2) Bracket match?
  if (Array.isArray(t.matches)) {
    const mine = t.matches.find((m: any) => Array.isArray(m?.players) && m.players.some((p: any) => idOf(p) === userId));
    if (mine) {
      const ready = mine?.status?.toUpperCase?.() === "READY" || mine?.state?.toUpperCase?.() === "READY" || mine?.tableNumber != null;
      if (ready) {
        return { phase: "match_ready", tableNumber: mine?.tableNumber ?? null, bracketRoundName: mine?.roundName ?? t?.roundName ?? null };
      }
      if (mine?.isNext || mine?.upNext) return { phase: "up_next" };
      return { phase: "queued" };
    }
  }

  // 3) Queue position?
  const queue =
    (Array.isArray(t.queue) && t.queue.length ? t.queue :
    Array.isArray(t.waitlist) && t.waitlist.length ? t.waitlist :
    Array.isArray(t.line) && t.line.length ? t.line : null);

  if (queue) {
    const arr = queue.map((p: any) => idOf(p));
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      const position = idx + 1;
      if (position === 1) return { phase: "up_next", position };
      return { phase: "queued", position };
    }
  }

  // 4) Fallback if they’re in players
  const players = Array.isArray(t.players) ? t.players : [];
  if (players.some((p: any) => idOf(p) === userId)) return { phase: "queued" };

  return { phase: "idle" };
}
