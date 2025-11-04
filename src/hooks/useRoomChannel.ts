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
 * Poll-only channel (no SSE/WS).
 * Reads /api/<kind>/<id> every 2500ms with cache-busting.
 */
export function useRoomChannel({ kind, id, onState, onError }: Args) {
  const lastV = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const stopped = useRef<boolean>(false);

  useEffect(() => {
    if (!id || !kind) return;
    stopped.current = false;
    lastV.current = 0;

    const tick = async () => {
      try {
        // Read the canonical document route your Next API already exposes.
        // Cache-bust via ts param, and send no-store headers.
        const res = await fetch(`/api/${encodeURIComponent(kind)}/${encodeURIComponent(id)}?ts=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'cache-control': 'no-store' },
        });

        if (!res.ok) {
          if (res.status !== 304) {
            // 404 (not created yet) or any 5xx: just ignore and try again later
            if (onError) onError(new Error(`Fetch ${res.status}`));
          }
          return;
        }

        const vHdr = Number(res.headers.get('x-l-version') || '0');
        const v = Number.isFinite(vHdr) ? vHdr : (Number as any)(0);
        if (v > lastV.current) {
          const doc = await res.json().catch(() => null);
          if (doc) {
            lastV.current = v;
            onState({ ...doc, v });
          }
        }
      } catch (e) {
        if (onError) onError(e);
      }
    };

    // start immediately, then poll
    tick();
    timerRef.current = window.setInterval(tick, 2500);

    return () => {
      stopped.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);
}
