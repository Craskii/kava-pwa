// src/lib/poll.ts
type LeaderMsg<T = any> = { etag: string | null; payload?: T };

type StartOpts<T> = {
  key: string; // unique per resource, e.g. "t:<id>" or "l:<id>"
  minMs?: number; // initial interval (default 4000)
  maxMs?: number; // max interval (default 60000)
  backoff?: number; // multiply when unchanged (default 1.7)
  boostMs?: number; // after change, stay fast briefly (default 3000)
  fetchOnce: (etag: string | null) => Promise<{ status: 200 | 304; etag: string | null; payload?: T }>;
  onChange: (payload: T, etag: string | null) => void;
};

export function startAdaptivePoll<T>(opts: StartOpts<T>) {
  const key = opts.key;
  const minMs = opts.minMs ?? 4000;
  const maxMs = opts.maxMs ?? 60000;
  const backoff = opts.backoff ?? 1.7;
  const boostMs = opts.boostMs ?? 3000;

  let timer: any = null;
  let delay = minMs;
  let etag: string | null = null;
  let stopped = false;

  // one-tab leader election for this resource
  const HEART = `${key}:heart`;
  const DATA = `${key}:data`;
  let amLeader = false;
  let heartTimer: any = null;

  function electLeader() {
    const mine = `${Date.now()}-${Math.random()}`;
    localStorage.setItem(HEART, mine);
    setTimeout(() => {
      amLeader = localStorage.getItem(HEART) === mine;
      if (amLeader) startLeader();
      else startFollower();
    }, 150);
  }

  function startLeader() {
    heartTimer = setInterval(() => localStorage.setItem(HEART, `${Date.now()}-${Math.random()}`), 2000);
    schedule(10);
  }
  function stopLeader() {
    clearInterval(heartTimer);
    heartTimer = null;
  }
  function startFollower() {
    window.addEventListener('storage', onStorage);
  }

  function onStorage(ev: StorageEvent) {
    if (ev.key === DATA && ev.newValue) {
      try {
        const msg: LeaderMsg = JSON.parse(ev.newValue);
        if (msg.etag && msg.etag !== etag && msg.payload) {
          etag = msg.etag;
          // @ts-ignore
          opts.onChange(msg.payload, msg.etag);
        }
      } catch {}
    }
  }

  function schedule(ms: number) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  async function tick() {
    if (stopped) return;

    // Pause/polite
    if (document.hidden || !navigator.onLine) { schedule(2000); return; }

    try {
      const r = await opts.fetchOnce(etag);
      if (r.status === 200 && r.payload) {
        etag = r.etag || null;
        opts.onChange(r.payload, etag);
        // broadcast latest to followers
        try { localStorage.setItem(DATA, JSON.stringify({ etag, payload: r.payload } as LeaderMsg)); } catch {}
        delay = Math.max(minMs, boostMs);
      } else {
        delay = Math.min(maxMs, Math.floor(delay * backoff));
      }
    } catch {
      delay = Math.min(maxMs, Math.floor(Math.max(minMs, delay * 1.5)));
    }
    schedule(delay);
  }

  function onFocusLike() {
    amLeader = false;
    window.removeEventListener('storage', onStorage);
    stopLeader();
    electLeader();
    delay = minMs;
    schedule(50);
  }

  window.addEventListener('focus', onFocusLike);
  document.addEventListener('visibilitychange', onFocusLike);
  window.addEventListener('online', onFocusLike);

  electLeader();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocusLike);
      document.removeEventListener('visibilitychange', onFocusLike);
      window.removeEventListener('online', onFocusLike);
      window.removeEventListener('storage', onStorage);
      stopLeader();
    },
    bump() { delay = minMs; schedule(50); }
  };
}
