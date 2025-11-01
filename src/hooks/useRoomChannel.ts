// src/hooks/useRoomChannel.ts
'use client';

import { useEffect, useRef, useState } from 'react';

type Message = { t?: string; data?: any; v?: number };
type Options = {
  kind: 'list' | 'tournament';
  id: string;
  onState?: (data: any) => void;
  getVersion?: (data: any) => number;
};

export function useRoomChannel({ kind, id, onState, getVersion }: Options) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const stopRef = useRef(false);
  const backoffRef = useRef(1000);
  const lastVersionRef = useRef<number>(-1);

  useEffect(() => {
    stopRef.current = false;
    backoffRef.current = 1000;
    lastVersionRef.current = -1;

    const url = `/api/room/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/sse`;

    const open = () => {
      if (stopRef.current) return;

      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }

      const es = new EventSource(url, { withCredentials: false });
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        backoffRef.current = 1000;
      };

      es.onerror = () => {
        setConnected(false);
        try { es.close(); } catch {}
        esRef.current = null;
        const delay = Math.min(backoffRef.current, 15000);
        setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 15000);
          open();
        }, delay);
      };

      es.onmessage = (e) => {
        let msg: Message;
        try { msg = JSON.parse(e.data); } catch { return; }
        const payload = msg.t === 'state' && 'data' in msg ? msg.data : msg;

        const incomingV =
          typeof msg.v === 'number' ? msg.v :
          getVersion ? Number(getVersion(payload)) :
          undefined;

        if (typeof incomingV === 'number') {
          if (incomingV <= lastVersionRef.current) return;
          lastVersionRef.current = incomingV;
        }

        onState?.(payload);
      };
    };

    open();

    return () => {
      stopRef.current = true;
      setConnected(false);
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
    };
  }, [kind, id, onState, getVersion]);

  return { connected };
}
