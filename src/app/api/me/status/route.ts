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

    // Fallbacks so AlertsGlobal works from any page:
    // 1) Latest list involving the user
    const mineL = await fetchMineLists(req, userId);
    const latestL = pickLatest([...mineL.playing, ...mineL.hosting]);
    if (latestL) {
      const l = await fetchList(req, latestL.id);
      const status = computeStatusFromList(l, userId);
      if (status.phase !== "idle") return NextResponse.json(status, { status: 200 });
    }
    // 2) Latest tournament involving the user
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
async function fetchMineLists(req: NextRequest, userId: string): Promise<{ hosting: any[]; playing: any[] }> {
  const res = await fetch(`${baseUrl(req)}/api/lists?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
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

/* ---------- normalize various id shapes ---------- */
const norm = (v: any) => (typeof v === "string" ? v : v?.id || v?.playerId || v?.uid || null);

/* ---------- TOURNAMENTS ---------- */
function computeStatusFromTournament(t: any, userId: string) {
  if (!t) return { phase: "idle" as const, sig: "idle" };

  // tables first
  const tables = Array.isArray(t.tables) ? t.tables : [];
  for (const tb of tables) {
    const tableNum = tb?.number ?? tb?.id ?? tb?.tableNumber ?? null;
    const current =
      Array.isArray(tb?.players) ? tb.players.map(norm) :
      Array.isArray(tb?.currentPlayers) ? tb.currentPlayers.map(norm) :
      Array.isArray(tb?.currentPlayerIds) ? tb.currentPlayerIds.map(norm) : [];
    if (current.some((p: any) => p === userId)) {
      const pairKey = current.join('-');
      let sig = `T-${tableNum ?? 'x'}-${pairKey}`;
      // ping awareness for tables (if you ever seat via tables)
      if ((t as any).lastPingAt && (t as any).lastPingTable === tableNum) {
        sig += `-P${(t as any).lastPingAt}`;
      }
      return { phase: "match_ready" as const, tableNumber: Number(tableNum) || null, sig };
    }
  }

  // bracket order
  const rounds: any[][] = Array.isArray(t.rounds) ? t.rounds : [];
  if (!rounds.length) return { phase: "idle" as const, sig: "idle" };

  const rIdx = rounds.findIndex(r => Array.isArray(r) && r.some(m => !m?.winner));
  if (rIdx === -1) return { phase: "idle" as const, sig: "done" };

  const round = rounds[rIdx];
  const mIdx = round.findIndex(m => !m?.winner);
  const cur = mIdx >= 0 ? round[mIdx] : null;
  const a = norm(cur?.a);
  const b = norm(cur?.b);
  let sig = `R${rIdx + 1}-M${mIdx + 1}-${a ?? 'x'}-${b ?? 'x'}`;

  // fold Ping into signature when it targets this current match
  if ((t as any).lastPingAt !== undefined && (t as any).lastPingR === rIdx && (t as any).lastPingM === mIdx) {
    sig += `-P${(t as any).lastPingAt}`;
  }

  if (a === userId || b === userId) {
    return { phase: "up_next" as const, bracketRoundName: `Round ${rIdx + 1}`, sig };
  }
  const later = round.some((m, i) => i > mIdx && (norm(m?.a) === userId || norm(m?.b) === userId));
  if (later) return { phase: "queued" as const, sig };
  return { phase: "idle" as const, sig };
}

/* ---------- LISTS ---------- */
function computeStatusFromList(l: any, userId: string) {
  if (!l) return { phase: "idle" as const, sig: "idle" };

  const tables = Array.isArray(l.tables) ? l.tables : [];
  for (let i = 0; i < tables.length; i++) {
    const tb = tables[i];
    const a = norm(tb?.a);
    const b = norm(tb?.b);
    if (a === userId || b === userId) {
      let sig = `LT${i + 1}-${a ?? 'x'}-${b ?? 'x'}`;
      if ((l as any).lastPingAt !== undefined && (l as any).lastPingTable === i) {
        sig += `-P${(l as any).lastPingAt}`;
      }
      return { phase: "match_ready" as const, tableNumber: i + 1, sig };
    }
  }

  const queue =
    (Array.isArray(l.queue) && l.queue.length ? l.queue :
     Array.isArray(l.waitlist) && l.waitlist.length ? l.waitlist :
     Array.isArray(l.line) && l.line.length ? l.line : null);

  if (queue) {
    const arr = queue.map((p: any) => norm(p)).filter(Boolean);
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      const position = idx + 1;
      if (position === 1) return { phase: "up_next" as const, position, sig: `LQ1-${arr.join('-')}` };
      return { phase: "queued" as const, position, sig: `LQ${position}-${arr.join('-')}` };
    }
  }

  return { phase: "idle" as const, sig: "idle" };
}
