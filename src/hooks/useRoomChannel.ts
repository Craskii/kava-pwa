// src/hooks/useRoomChannel.ts
import { useEffect, useRef } from "react";

type Handler = (msg: any) => void;

/**
 * Subscribes to room SSE and emits parsed events:
 * - {t:"state", data: {...}}  // DO publish
 * Degrades silently (no throws) if SSE fails.
 */
export function useRoomChannel(kind: "list" | "tournament", id: string, onMessage: Handler) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!id) return;

    let es: EventSource | null = null;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      try {
        es = new EventSource(`/api/room/${kind}/${encodeURIComponent(id)}/sse`);
      } catch {
        es = null;
        return;
      }
      if (!es) return;

      es.onmessage = (ev) => {
        try {
          // Expect server to send JSON lines (we always send JSON from DO)
          const obj = JSON.parse(ev.data);
          onMessageRef.current?.(obj);
        } catch {
          // ignore bad rows
        }
      };
      es.onerror = () => {
        // backoff reopen
        try { es?.close(); } catch {}
        es = null;
        if (!stopped) setTimeout(open, 1500);
      };
    };

    open();
    return () => {
      stopped = true;
      try { es?.close(); } catch {}
      es = null;
    };
  }, [kind, id]);
}
