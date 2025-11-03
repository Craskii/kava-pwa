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
 * Real-time WebSocket channel with snapshot fallback.
 * Reconnects automatically, minimal CPU cost.
 */
export function useRoomChannel({ kind, id, onState, onError }: Args) {
  const lastV = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);
  const stopped = useRef(false);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!id || !kind) return;
    stopped.current = false;
    lastV.current = 0;

    connectWS(kind, id, onStateSafe, onErrorSafe);
    startPoll(kind, id, onStateSafe);

    return () => {
      stopped.current = true;
      tryClose(wsRef.current);
      stopPoll();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  /** Handles state updates with version tracking */
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
    console.warn('[RoomChannel] error', err);
    if (onError) onError(err);
  }

  /** Establishes a WebSocket connection to the room DO */
  function connectWS(kind: string, id: string, cb: (p: any) => void, err: (e: unknown) => void) {
    tryClose(wsRef.current);

    const url = `wss://${location.host}/api/room/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/ws`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('WS init error', e);
      err(e);
      scheduleReconnect(kind, id, cb, err);
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[RoomChannel] ✅ Connected');
    };

    ws.onmessage = (event) => {
      if (stopped.current) return;
      try {
        const j = JSON.parse(event.data);
        cb(j?.t === 'state' ? j.data : j);
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onerror = (e) => {
      console.warn('[RoomChannel] socket error', e);
      err(e);
    };

    ws.onclose = () => {
      if (stopped.current) return;
      console.warn('[RoomChannel] ❌ Disconnected');
      scheduleReconnect(kind, id, cb, err);
    };
  }

  /** Retry WS after short delay */
  function scheduleReconnect(kind: string, id: string, cb: (p: any) => void, err: (e: unknown) => void) {
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    reconnectRef.current = setTimeout(() => {
      if (!stopped.current) connectWS(kind, id, cb, err);
    }, 4000);
  }

  /** Periodic HTTP snapshot fallback */
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
      } catch (e) {
        console.warn('[RoomChannel] poll error', e);
      }
    }, 10000); // every 10s (less frequent now)
  }

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
}

function tryClose(ws: WebSocket | null) {
  try {
    ws?.close();
  } catch {}
}
