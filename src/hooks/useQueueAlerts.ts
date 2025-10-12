'use client';

import { useEffect, useRef } from 'react';
import { getAlertsEnabled, subscribeAlertsChange, bumpAlerts } from '@/lib/alerts';
import { ensureNotificationPermission, showSystemNotification } from '@/lib/notifications';

type Status =
  | { phase: 'idle'; sig: string }
  | { phase: 'up_next'; sig: string; bracketRoundName?: string; position?: number }
  | { phase: 'queued'; sig: string; position?: number }
  | { phase: 'match_ready'; sig: string; tableNumber?: number; bracketRoundName?: string };

type Opts = {
  tournamentId?: string;
  listId?: string;
  upNextMessage?: ((s?: Status) => string) | string;
  matchReadyMessage?: ((s?: Status) => string) | string;
};

function msg(m?: Opts['upNextMessage'], s?: Status, fallback: string = "You're up!") {
  if (!m) return fallback;
  if (typeof m === 'function') return m(s);
  return m;
}

/** Polls /api/me/status and fires banners when phase → up_next or match_ready. */
export function useQueueAlerts(opts: Opts) {
  const { tournamentId, listId } = opts;
  const timerRef = useRef<number | null>(null);
  const lastSigRef = useRef<string>('');

  // Persist lastSig per scope to avoid duplicates across navigations
  useEffect(() => {
    const key = scopeKey(tournamentId, listId);
    try { lastSigRef.current = sessionStorage.getItem(key) || ''; } catch {}
  }, [tournamentId, listId]);

  useEffect(() => {
    let stopped = false;
    let inflight: AbortController | null = null;

    async function tick(immediate = false) {
      if (stopped) return;
      if (!getAlertsEnabled()) return; // short-circuit when OFF

      // ask permission once (non-blocking)
      ensureNotificationPermission();

      const userId = getUserId();
      if (!userId) return;

      const qs = new URLSearchParams({ userId });
      if (tournamentId) qs.set('tournamentId', tournamentId);
      if (listId) qs.set('listId', listId);

      inflight?.abort();
      inflight = new AbortController();

      try {
        const res = await fetch(`/api/me/status?${qs.toString()}`, {
          cache: 'no-store',
          signal: inflight.signal,
        });
        if (!res.ok) return;
        const s = (await res.json()) as Status;
        const sig = String(s?.sig || '');
        const key = scopeKey(tournamentId, listId);

        if (sig && sig !== lastSigRef.current) {
          // phase change => maybe notify
          if (s.phase === 'match_ready') {
            const text = msg(opts.matchReadyMessage, s, "OK — you're up on the table!");
            showSystemNotification('Ready to play', text);
          } else if (s.phase === 'up_next') {
            const text = msg(opts.upNextMessage, s,
              s?.bracketRoundName ? `You're up next in ${s.bracketRoundName}!` : "You're up next — be ready!");
            showSystemNotification('Heads up!', text);
          }
          lastSigRef.current = sig;
          try { sessionStorage.setItem(key, sig); } catch {}
        }
      } catch {
        // ignore
      } finally {
        inflight = null;
      }

      // cadence: 750ms when alerts are ON
      if (!stopped) {
        window.clearTimeout(timerRef.current!);
        timerRef.current = window.setTimeout(tick, immediate ? 750 : 750) as unknown as number;
      }
    }

    // start polling
    tick(true);

    // react to ON/OFF or bumps
    const unsub = subscribeAlertsChange(() => tick(true));

    return () => {
      stopped = true;
      unsub();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      inflight?.abort();
    };
  }, [tournamentId, listId, opts.upNextMessage, opts.matchReadyMessage]);
}

function getUserId(): string | null {
  try {
    const me = JSON.parse(localStorage.getItem('kava_me') || 'null');
    return me?.id || null;
  } catch { return null; }
}

function scopeKey(tId?: string, lId?: string) {
  if (tId) return `alerts_sig_t_${tId}`;
  if (lId) return `alerts_sig_l_${lId}`;
  return `alerts_sig_global`;
}

/** Expose bump for pages that want to force a re-check after they mutate state */
export { bumpAlerts };
