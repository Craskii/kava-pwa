import { useEffect, useRef } from "react";

type Handler = (msg: any) => void;

type ChannelKey = string;
type GlobalConn = { es: EventSource | null; refs: number };
type G = { conns: Record<ChannelKey, GlobalConn> };

function globs(): G {
  const any = globalThis as any;
  if (!any.__room_globs) any.__room_globs = { conns: {} } as G;
  return any.__room_globs as G;
}

/**
 * useRoomChannel
 * - Only opens ONE EventSource per (kind,id) across the tab.
 * - If `enabled` is false, does nothing.
 * - Auto closes on page hide; reopens on show.
 */
export function useRoomChannel(
  kind: "list" | "tournament",
  id: string,
  onMessage: Handler,
  enabled: boolean
) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !id) return;
    const key = `${kind}:${id}`;
    const g = globs();

    let vis = document.visibilityState;
    let killed = false;

    const open = () => {
      if (killed || document.visibilityState === "hidden") return;
      const rec = (g.conns[key] ||= { es: null, refs: 0 });
      if (rec.es) { rec.refs++; return; }

      const url = `/api/room/${kind}/${encodeURIComponent(id)}/sse`;
      const es = new EventSource(url, { withCredentials: false });
      rec.es = es;
      rec.refs = 1;

      es.onmessage = (ev) => {
        if (!ev.data) return;
        try { cbRef.current?.(JSON.parse(ev.data)); } catch {}
      };
      es.onerror = () => {
        try { es.close(); } catch {}
        rec.es = null;
        // backoff handled by server short-SSE via frequent reconnects
        if (!killed) setTimeout(open, 600);
      };
    };

    const close = () => {
      const rec = globs().conns[key];
      if (!rec) return;
      rec.refs = Math.max(0, rec.refs - 1);
      if (rec.refs === 0 && rec.es) {
        try { rec.es.close(); } catch {}
        rec.es = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === vis) return;
      vis = document.visibilityState;
      if (vis === "hidden") close(); else open();
    };

    document.addEventListener("visibilitychange", onVis);
    open();

    return () => {
      killed = true;
      document.removeEventListener("visibilitychange", onVis);
      close();
    };
  }, [kind, id, enabled]);
}
