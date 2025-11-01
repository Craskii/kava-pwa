// src/hooks/useRoomChannel.ts
'use client';

import { useEffect, useRef } from 'react';

type Options = {
  kind: 'list' | 'tournament';
  id: string;
  // Called when a full document payload arrives
  onMessage: (payload: any) => void;
  // Optional: observe channel state
  onStateChange?: (s: 'connecting' | 'open' | 'closed' | 'polling') => void;
  // Optional: how often to poll when WS is unavailable (ms)
  pollMs?: number;
};

/**
 * Tries WebSocket first; if it fails, falls back to polling /api/list/:id (or /api/tournament/:id)
 * Safe: never throws during render; cleans up timers/sockets on unmount.
 */
export function useRoomChannel(opts: Options) {
  const { kind, id, onMessage, onStateChange, pollMs = 4000 } = opts;

  const wsRef = useRef<WebSocket | null>(null);
  const killRef = useRef<() => void>(() => {});
  const retryRef = useRef<number>(1000); // backoff up to ~15s
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVRef = useRef<number>(0);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const setState = (s: 'connecting' | 'open' | 'closed' | 'polling') => {
      try { onStateChange?.(s); } catch {}
    };

    const startPolling = () => {
      if (cancelled) return;
      if (pollTimer.current) return;
      setState('polling');
      const url = kind === 'list'
        ? `/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`
        : `/api/tournament/${encodeURIComponent(id)}?ts=${Date.now()}`;

      const tick = async () => {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) return;
          const doc = await res.json();
          const v = Number(doc?.v ?? 0);
          if (v > lastVRef.current) {
            lastVRef.current = v;
            onMessage(doc);
          }
        } catch {/* ignore */}
      };

      // run once immediately, then interval
      tick();
      pollTimer.current = setInterval(tick, pollMs);
    };

    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    const openWS = () => {
      if (cancelled) return;
      setState('connecting');
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${kind}/${encodeURIComponent(id)}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        retryRef.current = 1000; // reset backoff
        setState('open');
        stopPolling(); // prefer WS when up
        try { ws.send(JSON.stringify({ type: 'hello' })); } catch {}
      };

      ws.onmessage = (ev) => {
  try {
    const msg = JSON.parse(ev.data);
    const payload = msg?.t === 'state' ? msg.data : msg;
    const v = Number(payload?.v ?? 0);
    if (v > lastVRef.current) lastVRef.current = v;
    onMessage(payload);
  } catch {/* ignore */}
};

      ws.onerror = () => {
        // we’ll get onclose right after; do fallback there
      };

      ws.onclose = () => {
        if (cancelled) return;
        setState('closed');
        // fall back to polling immediately
        startPolling();

        // schedule a reconnect with backoff
        const delay = Math.min(15000, retryRef.current);
        retryRef.current = Math.min(15000, retryRef.current * 2);
        setTimeout(() => {
          if (!cancelled) openWS();
        }, delay);
      };
    };

    // kick things off: try WS; polling will auto-start onclose
    openWS();

    // kill function
    killRef.current = () => {
      cancelled = true;
      stopPolling();
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };

    return () => {
      killRef.current();
    };
  }, [kind, id, onMessage, onStateChange, pollMs]);
}
