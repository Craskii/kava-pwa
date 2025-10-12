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
    audio = new Audio('/ding.mp3');
    audio.preload = 'auto';
  }
  return audio!;
}

function notifyBanner(title: string, body: string) {
  try {
    if (Notification.permission === 'granted') new Notification(title, { body });
  } catch {}
}

function chooseMessage(phase: string, opts: UseQueueAlertsOpts, status: any): string | null {
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

/** Small helper other code can call to force an immediate poll. */
export function bumpAlerts() {
  try { window.dispatchEvent(new Event('alerts:bump')); } catch {}
}

/** Main polling hook */
export function useQueueAlerts(opts: UseQueueAlertsOpts = {}) {
  const key = JSON.stringify({ t: opts.tournamentId || null, l: opts.listId || null });
  // @ts-ignore
  if (!window.__alerts) window.__alerts = {};
  // @ts-ignore
  if (window.__alerts[key]) return;
  // @ts-ignore
  window.__alerts[key] = true;

  let lastSig: string | null = null;

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

  let timer: any = null;
  function start() {
    if (timer) clearInterval(timer);
    const gap = document.visibilityState === 'visible' ? 3000 : 15000;
    timer = setInterval(check, gap);
  }
  start();

  document.addEventListener('visibilitychange', start);
  window.addEventListener('alerts:bump', check);
  setTimeout(check, 500);

  window.addEventListener('beforeunload', () => { clearInterval(timer); });
}
