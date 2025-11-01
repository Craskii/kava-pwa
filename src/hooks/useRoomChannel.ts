import { useEffect, useRef } from "react";

type Handler = (msg: any) => void;
const isBrowser = () => typeof window !== "undefined";

export function useRoomChannel(kind: "list" | "tournament", id: string, onMessage: Handler) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!isBrowser() || !id) return;

    let es: EventSource | null = null;
    let stop = false;
    let tries = 0;
    const debug = new URLSearchParams(window.location.search).has("debug");
    const log = (...a: any[]) => { if (debug) console.log("[room]", ...a); };

    const open = () => {
      if (stop) return;
      try {
        es = new EventSource(`/api/room/${kind}/${encodeURIComponent(id)}/sse`);
      } catch (e) {
        log("failed to construct EventSource", e);
        es = null;
        return;
      }
      if (!es) return;

      es.onopen = () => { tries = 0; log("SSE open"); };
      es.onmessage = (ev) => {
        if (!ev?.data) return;
        try {
          const obj = JSON.parse(ev.data);
          log("msg", obj);
          cbRef.current?.(obj);
        } catch (e) {
          log("bad json", ev.data);
        }
      };
      es.onerror = () => {
        log("SSE error -> retry");
        try { es?.close(); } catch {}
        es = null;
        if (!stop) {
          const backoff = Math.min(15000, 500 * Math.pow(2, tries++));
          setTimeout(open, backoff);
        }
      };
    };

    open();
    return () => { stop = true; try { es?.close(); } catch {}; es = null; };
  }, [kind, id]);
}
