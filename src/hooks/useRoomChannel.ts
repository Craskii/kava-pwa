import { useEffect, useRef } from "react";

type Handler = (msg: any) => void;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Opens SSE to /api/room/:kind/:id/sse.
 * Never throws during render. Retries with backoff.
 * When ?debug=1 is in URL, logs messages to console.
 */
export function useRoomChannel(kind: "list" | "tournament", id: string, onMessage: Handler) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!isBrowser() || !id) return;

    let es: EventSource | null = null;
    let stop = false;
    let tries = 0;
    const debug = new URLSearchParams(window.location.search).has("debug");

    const open = () => {
      if (stop) return;
      try {
        es = new EventSource(`/api/room/${kind}/${encodeURIComponent(id)}/sse`);
      } catch (e) {
        if (debug) console.warn("[room] failed to create EventSource", e);
        es = null;
        return;
      }
      if (!es) return;

      es.onopen = () => {
        tries = 0;
        if (debug) console.log("[room] SSE open");
      };

      es.onmessage = (ev) => {
        if (!ev?.data) return;
        try {
          const obj = JSON.parse(ev.data);
          if (debug) console.log("[room] message:", obj);
          cbRef.current?.(obj);
        } catch (e) {
          if (debug) console.warn("[room] bad JSON:", ev.data);
        }
      };

      es.onerror = () => {
        if (debug) console.warn("[room] SSE error; closing and retrying…");
        try { es?.close(); } catch {}
        es = null;
        if (!stop) {
          const backoff = Math.min(15000, 500 * Math.pow(2, tries++));
          setTimeout(open, backoff);
        }
      };
    };

    open();
    return () => {
      stop = true;
      try { es?.close(); } catch {}
      es = null;
    };
  }, [kind, id]);
}
