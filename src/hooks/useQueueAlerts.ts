'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

type UseQueueAlertsOpts = {
  tournamentId?: string;
  listId?: string;
  matchReadyMessage?: string | ((s: any) => string);
  upNextMessage?: string | ((s: any) => string);
};

const LS_KEY_LAST_SIG = 'kava_alerts_last_sig';
const LS_KEY_ENABLED  = 'kava_alerts_on';
const LS_KEY_LAST_FIRE= 'kava_alerts_last_fire';
const BUMP_KEY        = 'kava_alerts_bump';

declare global {
  interface Window {
    __kavaAlertLockUntil?: number;
    __kavaLastCheckAt?: number;
  }
}

export function alertsEnabled(): boolean {
  try { return localStorage.getItem(LS_KEY_ENABLED) === '1'; } catch { return false; }
}
export function setAlertsEnabled(on: boolean) {
  try { localStorage.setItem(LS_KEY_ENABLED, on ? '1' : '0'); } catch {}
}
export function bumpAlerts() {
  try { localStorage.setItem(BUMP_KEY, String(Date.now())); } catch {}
}

function showInAppBanner(text: string) {
  const id = 'kava-inapp-banner';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    Object.assign(el.style, {
      position: 'fixed', left:'10px', right:'10px', top:'10px',
      background:'rgba(14,165,233,.95)', color:'#000',
      borderRadius:'12px', padding:'10px 12px', zIndex:'999999',
      boxShadow:'0 10px 30px rgba(0,0,0,.35)', fontFamily:'system-ui',
      fontWeight:'700'
    } as CSSStyleDeclaration);
    const close = document.createElement('button');
    close.textContent = '×';
    Object.assign(close.style, {
      position:'absolute', right:'8px', top:'4px',
      background:'transparent', border:'none', fontSize:'18px', cursor:'pointer'
    } as CSSStyleDeclaration);
    close.onclick = () => el?.remove();
    el.appendChild(close);
    const p = document.createElement('div'); p.id = id+'-txt'; el.appendChild(p);
    document.body.appendChild(el);
  }
  const p = document.getElementById(id+'-txt'); if (p) p.textContent = text;
  setTimeout(() => { document.getElementById(id)?.remove(); }, 6000);
}

function resolveMessage(msg: string | ((s:any)=>string) | undefined, status: any, fallback: string) {
  if (!msg) return fallback;
  return typeof msg === 'function' ? msg(status) : msg;
}

async function fetchStatus(base: { tournamentId?: string; listId?: string; userId: string }) {
  const params = new URLSearchParams({ userId: base.userId });
  if (base.tournamentId) params.set('tournamentId', base.tournamentId);
  if (base.listId) params.set('listId', base.listId);
  const res = await fetch(`/api/me/status?${params}`, { cache: 'no-store' });
  if (!res.ok) return { phase: 'idle', sig: 'idle' };
  return res.json();
}

async function askPermission() {
  if (!('Notification' in window)) return;
  try { if (Notification.permission === 'default') await Notification.requestPermission(); } catch {}
}

function fireBanner(text: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(text);
      return;
    }
  } catch { /* fall back below */ }
  showInAppBanner(text);
}

/** single-window lock: prevent two banners within a short window */
function acquireWindowLock(ms = 1500): boolean {
  const now = Date.now();
  const until = window.__kavaAlertLockUntil || 0;
  if (now < until) return false;
  window.__kavaAlertLockUntil = now + ms;
  return true;
}

/** tiny throttle for status checks */
function shouldSkipCheck(): boolean {
  const now = Date.now();
  const last = window.__kavaLastCheckAt || 0;
  if (now - last < 250) return true; // micro-throttle
  window.__kavaLastCheckAt = now;
  return false;
}

export function useQueueAlerts(opts: UseQueueAlertsOpts) {
  const { tournamentId, listId } = opts;
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch { return null; }
  }, []);
  const userId = me?.id;

  const manualCheck = useCallback(async () => {
    if (!alertsEnabled() || !userId) return;
    if (shouldSkipCheck()) return;

    const status = await fetchStatus({ userId, tournamentId, listId });

    // Compare-and-set signature BEFORE firing (dedupe across callers)
    const nextSig = String(status?.sig || 'idle');
    let prevSig = '';
    try { prevSig = localStorage.getItem(LS_KEY_LAST_SIG) || ''; } catch {}

    if (!nextSig || nextSig === prevSig) return;

    // Try to store immediately so any concurrent caller sees the new value
    try { localStorage.setItem(LS_KEY_LAST_SIG, nextSig); } catch {}

    // Also gate with a per-window lock so two callers in same tab don't both fire
    if (!acquireWindowLock()) return;

    // As a final guard, re-read lastSig after a microtask (in case another tab raced)
    await Promise.resolve();
    try { prevSig = localStorage.getItem(LS_KEY_LAST_SIG) || ''; } catch {}
    if (prevSig !== nextSig) return; // someone else already superseded

    // Optional: small spacing between real system banners
    try {
      const lastFire = Number(localStorage.getItem(LS_KEY_LAST_FIRE) || 0);
      const now = Date.now();
      if (now - lastFire < 1200) return; // global spacing across tabs
      localStorage.setItem(LS_KEY_LAST_FIRE, String(now));
    } catch {}

    if (status?.phase === 'match_ready') {
      const msg = resolveMessage(opts.matchReadyMessage, status, "OK — you're up on the table!");
      fireBanner(msg);
    } else if (status?.phase === 'up_next') {
      const msg = resolveMessage(opts.upNextMessage, status, "You're up next — be ready!");
      fireBanner(msg);
    }
  }, [userId, tournamentId, listId, opts.matchReadyMessage, opts.upNextMessage]);

  useEffect(() => {
    if (!userId) return;

    // init permission ping (no-op if already decided)
    askPermission();

    // run once at mount
    manualCheck();

    // visibility/focus wake
    const onVis = () => { if (document.visibilityState === 'visible') manualCheck(); };
    const onFocus = () => manualCheck();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    // cross-tab bumps wake
    const onStorage = (e: StorageEvent) => {
      if (e.key === BUMP_KEY || e.key === LS_KEY_LAST_SIG) manualCheck();
    };
    window.addEventListener('storage', onStorage);

    // SSE for tournaments (instant wake)
    let es: EventSource | null = null;
    if (tournamentId) {
      try {
        es = new EventSource(`/api/tournament/${encodeURIComponent(tournamentId)}/stream`);
        es.onmessage = () => manualCheck();
        es.onerror = () => { /* ok */ };
      } catch {}
    }

    // modest poll for lists (until we add SSE for lists)
    let int: any = null;
    if (listId) {
      let period = 1500;
      let runs = 0;
      int = setInterval(() => {
        manualCheck();
        runs++;
        if (runs === 40) period = 4000;
      }, period);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      if (es) es.close();
      if (int) clearInterval(int);
    };
  }, [userId, tournamentId, listId, manualCheck]);

  const ensurePermissions = useCallback(async () => {
    await askPermission();
    if (!('Notification' in window) || Notification.permission === 'granted') {
      try { localStorage.setItem(LS_KEY_ENABLED, '1'); } catch {}
      bumpAlerts();
    }
  }, []);

  return { ensurePermissions };
}
