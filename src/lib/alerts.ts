// src/lib/alerts.ts
'use client';

type UseQueueAlertsOpts = {
  tournamentId?: string;
  listId?: string;
  upNextMessage?: string | ((s: any) => string);
  matchReadyMessage?: string | ((s: any) => string);
};

let audio: HTMLAudioElement | null = null;
function ensureAudio() {
  if (!audio) {
    audio = new Audio('/ding.mp3'); // your sound file
    audio.preload = 'auto';
  }
  return audio!;
}

function notifyBanner(title: string, body: string) {
  try {
    if (Notification?.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {}
}

function chooseMessage(
  phase: string,
  opts: UseQueueAlertsOpts,
  status: any
): string | null {
  if (phase === 'up_next') {
    if (typeof opts.upNextMessage === 'function') return opts.upNextMessage(status);
    return opts.upNextMessage ?? "You're up next — good luck! :)";
  }
  if (phase === 'match_ready') {
    if (typeof opts.matchReadyMessage === 'function') return opts.matchReadyMessage(status);
    return typeof opts.upNextMessage === 'string' ? opts.upNextMessage : "You're up!";
  }
  return null;
}

/** anyone can call to force an immediate poll */
export function bumpAlerts() {
  try { window.dispatchEvent(new Event('alerts:bump')); } catch {}
}

/** Main polling hook (singleton per scope) with burst mode */
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
      const params = new URLSearchParams();
      const me = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (me?.id) params.set('userId', me.id);
      if (opts.tournamentId) params.set('tournamentId', opts.tournamentId);
      if (opts.listId) params.set('listId', opts.listId);
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const status = await res.json();
      const { phase, sig } = status || {};
      if (!sig || !phase) return;

      if (sig !== lastSig) {
        lastSig = sig;
        const msg = chooseMessage(phase, opts, status);
        if (!msg) return;

        const visible = document.visibilityState === 'visible';
        if (visible) {
          try { await ensureAudio().play(); } catch {}
        } else {
          notifyBanner('Kava', msg);
        }
      }
    } catch {}
  }

  function intervalMs() {
    // burst for 10s after any bump
    const now = Date.now();
    if (now < burstUntil) return 500;
    return document.visibilityState === 'visible' ? 1000 : 5000;
  }

  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(check, intervalMs());
  }

  // on visibility change, reseat cadence
  function onVis() { restartTimer(); }

  // on bump, enter burst mode and run an immediate check
  function onBump() {
    burstUntil = Date.now() + 10_000;
    restartTimer();
    check();
  }

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('alerts:bump', onBump);

  // kick off
  burstUntil = Date.now() + 5_000; // start snappy for first few seconds
  restartTimer();
  setTimeout(check, 200);

  window.addEventListener('beforeunload', () => { clearInterval(timer); });
}
