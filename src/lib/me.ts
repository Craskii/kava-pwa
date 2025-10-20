// src/lib/me.ts
import { uid } from '@/lib/storage';

export type Me = { id: string; name: string };

export function getOrCreateMe(defaultName = 'Player'): Me {
  try {
    const raw = localStorage.getItem('kava_me');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && typeof parsed.id === 'string') return parsed as Me;
    }
  } catch {}
  const fresh: Me = { id: uid(), name: defaultName };
  try { localStorage.setItem('kava_me', JSON.stringify(fresh)); } catch {}
  return fresh;
}
