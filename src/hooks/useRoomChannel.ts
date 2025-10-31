// src/hooks/useRoomChannel.ts
'use client';

import { useEffect, useRef } from 'react';

type Options<T> = {
  kind: 'list' | 'tournament';
  id: string;
  onMessage: (payload: T) => void;
};

export function useRoomChannel<T>({ kind, id, onMessage }: Options<T>) {
  const ref = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!id) return;
    const url = `/api/room/${kind}/${encodeURIComponent(id)}/sse`;
    let es = new EventSource(url);
    ref.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (!data?.__ping) onMessage(data as T);
      } catch {}
    };
    es.onerror = () => {
      try { es.close(); } catch {}
      ref.current = null;
      setTimeout(() => { if (!ref.current) ref.current = new EventSource(url); }, 1500);
    };

    return () => { try { ref.current?.close(); } catch {}; ref.current = null; };
  }, [kind, id, onMessage]);
}
