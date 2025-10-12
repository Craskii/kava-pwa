// src/hooks/useQueueAlerts.ts
'use client';

import { useEffect, useRef } from 'react';
import {
  getAlertsEnabled,
  subscribeAlertsChange,
  bumpAlertsSignal,
  showSystemNotification,
} from '@/lib/alerts';

const DING = '/sounds/up-next.mp3';

let unlockedAudio = false;
let audioEl: HTMLAudioElement | null = null;
function ensureAudio() {
  if (typeof window === 'undefined') return null;
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.src = DING;
    audioEl.preload = 'auto';
    audioEl.crossOrigin = 'anonymous';
  }
  return audioEl;
}

function playDing() {
  try {
    const a = ensureAudio();
    if (!a) return;
    // iOS requires a prior user gesture on the page at least once
    a.play().then(() => {
      a.pause();
      a.currentTime = 0;
      unlockedAudio = true;
    }).catch(() => {});
  } catch {}
}
export function bumpAlerts() {
  // public bump for pages
  bumpAlertsSignal();
}

type QueueOpts = {
  listId?: string;
  tournamentId?: string;
  upNextMessage?: string | (() => string);
  matchReadyMessage?: string | (() => string);
};

export function useQueueAlerts(opts: QueueOpts) {
  const { listId, tournamentId } = opts;
  const getMsg = (v?: string | (() => string)) =>
    typeof v === 'function' ? (v as any)() : v;

  const lastSig = useRef<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // unlock audio on first interaction
    const unlock = () => { playDing(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock, { once: true });

    let stop = false;

    async function check() {
      if (stop || !getAlertsEnabled()) return;

      const qs = new URLSearchParams();
      const me = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (!me?.id) return;
      qs.set('userId', me.id);
      if (listId) qs.set('listId', listId);
      if (tournamentId) qs.set('tournamentId', tournamentId);

      const res = await fetch(`/api/me/status?${qs}`, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return;
      const s = await res.json();

      // s.sig must change to notify
      if (s?.sig && s.sig !== lastSig.current) {
        lastSig.current = s.sig;

        // phase -> message
        let body = '';
        if (s.phase === 'up_next') {
          body = getMsg(opts.upNextMessage) || (tournamentId ? `You're up next in ${s.bracketRoundName || 'the bracket'}!` : `You're up!`);
        } else if (s.phase === 'match_ready') {
          body = getMsg(opts.matchReadyMessage) || (listId ? `OK — you're up on the table!` : `It's your match now!`);
        }

        if (body) {
          // banner (iOS silent), plus local ding if unlocked
          showSystemNotification('Kava', body);
          if (unlockedAudio) {
            try { await ensureAudio()?.play(); ensureAudio()!.currentTime = 0; } catch {}
          }
        }
      }
    }

    // poll with backoff + bump handling
    let t: any = null;
    const loop = async (delay = 1200) => {
      await check();
      if (!stop) t = setTimeout(() => loop(1200), delay);
    };
    loop(100);

    const off1 = subscribeAlertsChange(() => check());
    const onBump = () => check();
    window.addEventListener('kava:alerts-bump', onBump as any);

    return () => {
      stop = true;
      if (t) clearTimeout(t);
      off1();
      window.removeEventListener('kava:alerts-bump', onBump as any);
    };
  }, [listId, tournamentId, opts.upNextMessage, opts.matchReadyMessage]);
}
