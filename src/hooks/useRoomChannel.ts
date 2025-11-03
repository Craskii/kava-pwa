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
 * WebSocket client with poll fallback.
 */
export function useRoomChannel({ kind, id, onState, onError }: Args) {
  const lastV = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (!id || !kind) return;
    stopped.current = false;
    lastV.current = 0;

    attachWS(kind, id, onStateSafe, onErrorSafe);
    startPoll(kind, id, onStateSafe);

    return () => {
      stopped.current = true;
      tryClose(wsRef.current);
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
        const res = await fetch(
          `/api/room/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/snapshot?ts=${Date.now()}`,
          { cache: 'no-store' }
        );
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

  function attachWS(kind: string, id: string, cb: (p: any) => void, err: (e: unknown) => void) {
    tryClose(wsRef.current);

    const url =
      (location.protocol === 'https:' ? 'wss://' : 'ws://') +
      location.host +
      `/api/room/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      err(e);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      // optional ping
      safeSend(ws, { t: 'ping' });
    };
    ws.onmessage = (e) => {
      if (stopped.current) return;
      try {
        const j = JSON.parse(e.data);
        // hub sends {t:'state', v, data}
        if (j?.t === 'state' && j?.data) {
          cb({ v: j.v ?? 0, ...j.data });
        }
      } catch {
        // ignore
      }
    };
    ws.onerror = (ev) => {
      err(ev);
    };
    ws.onclose = () => {
      // Will keep poll fallback running; try a lazy reconnect
      setTimeout(() => {
        if (!stopped.current) attachWS(kind, id, cb, err);
      }, 4000);
    };

    // reattach on visibility change
    const vis = () => {
      if (document.visibilityState === 'visible' && !stopped.current) {
        tryClose(wsRef.current);
        attachWS(kind, id, cb, err);
      }
    };
    document.addEventListener('visibilitychange', vis, { passive: true });
    ws.addEventListener('close', () => document.removeEventListener('visibilitychange', vis));
  }
}

function tryClose(ws: WebSocket | null) {
  try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch {}
}
function safeSend(ws: WebSocket, obj: any) {
  try { ws.send(JSON.stringify(obj)); } catch {}
}
