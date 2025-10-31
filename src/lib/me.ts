// src/lib/me.ts
export type Me = { id: string; name: string };

export function uid() {
  // same uid style you use elsewhere; keep stable
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
}

export function getMe(): Me {
  if (typeof window === 'undefined') return { id: 'server', name: 'Server' };
  try {
    const raw = localStorage.getItem('kava_me');
    if (raw) return JSON.parse(raw);
  } catch {}
  const fresh = { id: uid(), name: 'Player' } as Me;
  try { localStorage.setItem('kava_me', JSON.stringify(fresh)); } catch {}
  return fresh;
}

export function setMe(partial: Partial<Me>) {
  if (typeof window === 'undefined') return;
  const cur = getMe();
  const next = { ...cur, ...partial };
  localStorage.setItem('kava_me', JSON.stringify(next));
  return next;
}
