// src/app/api/me/status/route.ts
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

/** read either camelCase or lowercase param names */
function qp(url: URL, key: string) {
  return url.searchParams.get(key) ?? url.searchParams.get(key.toLowerCase());
}
function noStore(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('CDN-Cache-Control', 'no-store');
  res.headers.set('Vary', 'Accept');
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const userId = qp(url, 'userId') || '';
    const tournamentId = qp(url, 'tournamentId');
    const listId = qp(url, 'listId');

    if (!userId) return noStore(NextResponse.json({ phase: 'idle' }, { status: 200 }));

    if (tournamentId) {
      const t = await fetchTournament(req, tournamentId);
      return noStore(NextResponse.json(computeStatusFromTournament(t, userId), { status: 200 }));
    }
    if (listId) {
      const l = await fetchList(req, listId);
      return noStore(NextResponse.json(computeStatusFromList(l, userId), { status: 200 }));
    }

    // Fallbacks
    const mineL = await fetchMineLists(req, userId);
    const latestL = pickLatest([...(mineL?.playing ?? []), ...(mineL?.hosting ?? [])]);
    if (latestL) {
      const l = await fetchList(req, latestL.id);
      const st = computeStatusFromList(l, userId);
      if (st.phase !== 'idle') return noStore(NextResponse.json(st, { status: 200 }));
    }

    const mineT = await fetchMineTournaments(req, userId);
    const latestT = pickLatest([...(mineT?.playing ?? []), ...(mineT?.hosting ?? [])]);
    if (latestT) {
      const t = await fetchTournament(req, latestT.id);
      const st = computeStatusFromTournament(t, userId);
      if (st.phase !== 'idle') return noStore(NextResponse.json(st, { status: 200 }));
    }

    return noStore(NextResponse.json({ phase: 'idle' }, { status: 200 }));
  } catch {
    return noStore(NextResponse.json({ phase: 'idle' }, { status: 200 }));
  }
}

/* ------------ helpers ------------ */
const baseUrl = (req: NextRequest) => req.nextUrl.origin;

async function fetchTournament(req: NextRequest, id: string) {
  const res = await fetch(`${baseUrl(req)}/api/tournament/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}
async function fetchList(req: NextRequest, id: string) {
  const res = await fetch(`${baseUrl(req)}/api/list/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}
async function fetchMineTournaments(req: NextRequest, userId: string) {
  const res = await fetch(`${baseUrl(req)}/api/tournaments?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
  if (!res.ok) return { hosting: [], playing: [] };
  return res.json();
}
async function fetchMineLists(req: NextRequest, userId: string) {
  const res = await fetch(`${baseUrl(req)}/api/lists?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
  if (!res.ok) return { hosting: [], playing: [] };
  return res.json();
}
function pickLatest(list: any[]): any | null {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort((a,b)=>(+b?.createdAt||0)-(+a?.createdAt||0))[0];
}
const norm = (v: any) => (typeof v === 'string' ? v : v?.id || v?.playerId || v?.uid || null);

/* ------------ TOURNAMENT ------------ */
function computeStatusFromTournament(t: any, userId: string) {
  if (!t) return { source: 'tournament' as const, tournamentId: null, phase: 'idle' as const, sig: 'idle' };

  const tables = Array.isArray(t.tables) ? t.tables : [];
  for (const tb of tables) {
    const tableNum = tb?.number ?? tb?.id ?? tb?.tableNumber ?? null;
    const current =
      Array.isArray(tb?.players) ? tb.players.map(norm) :
      Array.isArray(tb?.currentPlayers) ? tb.currentPlayers.map(norm) :
      Array.isArray(tb?.currentPlayerIds) ? tb.currentPlayerIds.map(norm) : [];
    if (current.some((p: any) => p === userId)) {
      let sig = `TBL-${tableNum ?? 'x'}-${current.join('-')}`;
      if ((t as any).lastPingAt && (t as any).lastPingTable === tableNum) sig += `-P${(t as any).lastPingAt}`;
      return {
        source: 'tournament' as const,
        tournamentId: t?.id ?? null,
        phase: 'match_ready' as const,
        tableNumber: Number(tableNum) || null,
        sig
      };
    }
  }

  const rounds: any[][] = Array.isArray(t.rounds) ? t.rounds : [];
  if (!rounds.length) return { source: 'tournament' as const, tournamentId: t?.id ?? null, phase: 'idle' as const, sig: 'idle' };

  const rIdx = rounds.findIndex(r => Array.isArray(r) && r.some(m => !m?.winner));
  if (rIdx === -1) return { source: 'tournament' as const, tournamentId: t?.id ?? null, phase: 'idle' as const, sig: 'done' };

  const round = rounds[rIdx];
  const mIdx = round.findIndex(m => !m?.winner);
  const cur = mIdx >= 0 ? round[mIdx] : null;
  const a = norm(cur?.a); const b = norm(cur?.b);

  let sig = `R${rIdx+1}-M${mIdx+1}-${a ?? 'x'}-${b ?? 'x'}`;
  if ((t as any).lastPingAt !== undefined && (t as any).lastPingR === rIdx && (t as any).lastPingM === mIdx) {
    sig += `-P${(t as any).lastPingAt}`;
  }

  if (a === userId || b === userId) {
    return {
      source: 'tournament' as const,
      tournamentId: t?.id ?? null,
      phase: 'up_next' as const,
      bracketRoundName: `Round ${rIdx + 1}`,
      sig
    };
  }

  const later = round.some((m, i) => i > mIdx && (norm(m?.a) === userId || norm(m?.b) === userId));
  if (later) return { source: 'tournament' as const, tournamentId: t?.id ?? null, phase: 'queued' as const, sig };

  return { source: 'tournament' as const, tournamentId: t?.id ?? null, phase: 'idle' as const, sig };
}

/* ------------- LISTS ------------- */
function computeStatusFromList(l: any, userId: string) {
  if (!l) return { source: 'list' as const, listId: null, phase: 'idle' as const, sig: 'idle' };

  const tables = Array.isArray(l.tables) ? l.tables : [];
  for (let i=0;i<tables.length;i++) {
    const tb = tables[i];
    const a = norm(tb?.a); const b = norm(tb?.b);
    if (a === userId || b === userId) {
      let sig = `LT${i+1}-${a ?? 'x'}-${b ?? 'x'}`;
      if ((l as any).lastPingAt !== undefined && (l as any).lastPingTable === i) sig += `-P${(l as any).lastPingAt}`;
      return {
        source: 'list' as const,
        listId: l?.id ?? null,
        phase: 'match_ready' as const,
        tableNumber: i+1,
        sig
      };
    }
  }

  const queue = Array.isArray(l.queue) ? l.queue :
                Array.isArray(l.waitlist) ? l.waitlist :
                Array.isArray(l.line) ? l.line : [];
  if (Array.isArray(queue) && queue.length) {
    const arr = queue.map(norm).filter(Boolean);
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      const pos = idx + 1;
      if (pos === 1) {
        return {
          source: 'list' as const,
          listId: l?.id ?? null,
          phase: 'up_next' as const,
          position: 1,
          sig: `LQ1-${arr.join('-')}`
        };
      }
      return {
        source: 'list' as const,
        listId: l?.id ?? null,
        phase: 'queued' as const,
        position: pos,
        sig: `LQ${pos}-${arr.join('-')}`
      };
    }
  }

  return { source: 'list' as const, listId: l?.id ?? null, phase: 'idle' as const, sig: 'idle' };
}
