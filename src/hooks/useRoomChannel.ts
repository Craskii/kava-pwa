'use client';

import { useEffect, useRef } from 'react';

type Options<T> = {
  kind: 'list'|'tournament';
  id: string;
  onMessage: (data: T) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export function useRoomChannel<T = any>({ kind, id, onMessage, onOpen, onClose }: Options<T>) {
  const sockRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const connect = () => {
      if (!aliveRef.current) return;
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${kind}/${encodeURIComponent(id)}/ws`;
      const ws = new WebSocket(url);
      sockRef.current = ws;

      ws.addEventListener('open', () => {
        backoffRef.current = 1000;
        onOpen?.();
      });

      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.t === 'state') onMessage(msg.data as T);
        } catch {}
      });

      const scheduleReconnect = () => {
        if (!aliveRef.current) return;
        const delay = Math.min(15000, backoffRef.current);
        backoffRef.current = Math.min(15000, backoffRef.current * 2);
        setTimeout(connect, delay);
      };

      ws.addEventListener('close', () => { onClose?.(); scheduleReconnect(); });
      ws.addEventListener('error', () => { try { ws.close(); } catch {}; scheduleReconnect(); });
    };

    connect();

    // visibility: pause sockets when hidden
    const vis = () => {
      const hidden = document.visibilityState === 'hidden';
      const s = sockRef.current;
      if (hidden && s) { try { s.close(); } catch {} }
      else if (!hidden && (!sockRef.current || sockRef.current.readyState !== WebSocket.OPEN)) {
        backoffRef.current = 1000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', vis);

    return () => {
      aliveRef.current = false;
      document.removeEventListener('visibilitychange', vis);
      const s = sockRef.current;
      sockRef.current = null;
      if (s) try { s.close(); } catch {}
    };
  }, [kind, id, onMessage, onOpen, onClose]);
}
