// src/hooks/useRoomChannel.ts
'use client';

import { useEffect, useRef } from 'react';

type Args = {
  kind: 'list' | 'tournament';
  id: string;
  onState: (data: any) => void;
  onError?: (err: unknown) => void;
};

/**
 * Lightweight SSE client with poll fallback.
 * No external imports to avoid circular deps.
 */
export function useRoomChannel({ kind, id, onState, onError }: Args) {
  const lastV = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (!id || !kind) return;
    stopped.current = false;
    lastV.current = 0;

    attachSSE(kind, id, onStateSafe, onErrorSafe);
    startPoll(kind, id, onStateSafe);

    return () => {
      stopped.current = true;
      tryClose(esRef.current);
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  function onStateSafe(payload: any) {
    if (stopped.current) return;
    try {
      const v = Number(payload?.v ?? 0);
      if (!Number.isFinite(v) || v <= lastV.current) return;
      lastV.current = v;
      onState(payload);
    } catch (e) {
      onErrorSafe(e);
    }
  }

  function onErrorSafe(err: unknown) {
    if (stopped.current) return;
    if (onError) onError(err);
  }

  function startPoll(kind: string, id: string, cb: (p: any) => void) {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/room/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/snapshot?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        cb(json);
      } catch {}
    }, 5000);
  }

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function attachSSE(kind: string, id: string, cb: (p: any) => void, err: (e: unknown) => void) {
    tryClose(esRef.current);
    const es = new EventSource(`/api/room/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/sse?ts=${Date.now()}`);
    esRef.current = es;

    es.onmessage = (e) => {
      if (stopped.current) return;
      try {
        // our DO sends { t:'state', data:{...} } or just the raw doc
        const j = JSON.parse(e.data);
        cb(j?.t === 'state' ? j.data : j);
      } catch {
        // if not JSON, ignore
      }
    };
    es.onerror = () => {
      tryClose(esRef.current);
      // keep poll running; we’ll retry SSE on focus
      setTimeout(() => {
        if (!stopped.current) attachSSE(kind, id, cb, err);
      }, 4000);
    };

    // reattach on visibility change
    const vis = () => {
      if (document.visibilityState === 'visible' && !stopped.current) {
        tryClose(esRef.current);
        attachSSE(kind, id, cb, err);
      }
    };
    document.addEventListener('visibilitychange', vis, { passive: true });
    es.addEventListener('close', () => document.removeEventListener('visibilitychange', vis));
  }
}

function tryClose(es: EventSource | null) {
  try { es?.close(); } catch {}
}
