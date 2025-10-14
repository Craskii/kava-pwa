// src/lib/alerts.ts
'use client';

type UseQueueAlertsOpts = {
  tournamentId?: string;
  listId?: string;
  upNextMessage?: string | ((s: any) => string);
  matchReadyMessage?: string | ((s: any) => string);
};

function showBanner(body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Kava', { body });
    }
  } catch {}
}

/** let any page tell the poller “check right now” */
export function bumpAlerts() {
  try { window.dispatchEvent(new Event('alerts:bump')); } catch {}
}

function chooseMessage(phase: string, opts: UseQueueAlertsOpts, status: any): string | null {
  if (phase === 'match_ready') {
    if (typeof opts.matchReadyMessage === 'function') return opts.matchReadyMessage(status);
    // default: seated
    return opts.matchReadyMessage ?? 'Your in table';
  }
  if (phase === 'up_next') {
    if (typeof opts.upNextMessage === 'function') return opts.upNextMessage(status);
    // default: first in queue (list) or next match (tournament)
    return opts.upNextMessage ?? 'your up next get ready!!';
  }
  return null;
}

/** Singleton poller per-scope with burst mode for instant banners */
export function useQueueAlerts(opts: UseQueueAlertsOpts = {}) {
  const key = JSON.stringify({ t: opts.tournamentId || null, l: opts.listId || null });
  // @ts-ignore
  if (!window.__alerts) window.__alerts = {};
  // @ts-ignore
  if (window.__alerts[key]) return;
  // @ts-ignore
  window.__alerts[key] = true;

  let lastSig: string | null = null;
  let timer: any = null;
  let burstUntil = 0;

  async function check() {
    try {
      let url = '/api/me/status';
      const me = JSON.parse(localStorage.getItem('kava_me') || 'null');
      const qs = new URLSearchParams();
      if (me?.id) qs.set('userId', me.id);
      if (opts.tournamentId) qs.set('tournamentId', String(opts.tournamentId));
      if (opts.listId) qs.set('listId', String(opts.listId));
      const q = qs.toString();
      if (q) url += `?${q}`;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const status = await res.json();
      const phase = status?.phase;
      const sig = status?.sig;
      if (!phase || !sig) return;

      if (sig !== lastSig) {
        lastSig = sig;
        const msg = chooseMessage(phase, opts, status);
        if (msg) showBanner(msg);
      }
    } catch {}
  }

  function cadenceMs() {
    const now = Date.now();
    if (now < burstUntil) return 500;                     // 0.5s during burst
    return document.visibilityState === 'visible' ? 1000  // 1s in foreground
                                                  : 5000; // 5s in background
  }

  function restart() {
    if (timer) clearInterval(timer);
    timer = setInterval(check, cadenceMs());
  }

  function onVisibility() { restart(); }
  function onBump() {
    burstUntil = Date.now() + 10_000; // 10s of fast checks after a bump
    restart();
    check();
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('alerts:bump', onBump);

  // start “snappy” at first
  burstUntil = Date.now() + 5_000;
  restart();
  setTimeout(check, 200);

  window.addEventListener('beforeunload', () => { clearInterval(timer); });
}
