'use client';

import { useCallback, useEffect, useMemo } from 'react';

type UseQueueAlertsOpts = {
  tournamentId?: string;
  listId?: string;
  matchReadyMessage?: string | ((s: any) => string);
  upNextMessage?: string | ((s: any) => string);
};

const LS_KEY_LAST_SIG  = 'kava_alerts_last_sig';
const LS_KEY_ENABLED   = 'kava_alerts_on';
const LS_KEY_LAST_FIRE = 'kava_alerts_last_fire';
const BUMP_KEY         = 'kava_alerts_bump';

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
  } catch {}
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
  if (now - last < 250) return true;
  window.__kavaLastCheckAt = now;
  return false;
}

/** Normalize table number */
function getTableNumber(status: any): number | null {
  const raw =
    status?.table?.number ??
    status?.tableNumber ??
    status?.table_index ??
    status?.tableId ??
    status?.table ??
    null;

  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  // if backend sends 0/1 for tables, show 1/2 to the user
  return n === 0 || n === 1 ? n + 1 : n;
}

function isOnTable(status: any): boolean {
  if (status?.phase === 'match_ready' || status?.phase === 'on_table' || status?.phase === 'seated') return true;
  if (getTableNumber(status) != null) return true;
  return Boolean(status?.tableAssigned || status?.hasTable);
}

function isFirstInQueue(status: any): boolean {
  const p =
    status?.position ??
    status?.queuePosition ??
    status?.place ??
    status?.rank ??
    null;

  if (p == null) return Boolean(status?.queueTop || status?.isNext || status?.upNext);
  const n = Number(p);
  if (!Number.isFinite(n)) return false;
  return n === 0 || n === 1;
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

    // Rich signature so we don't miss transitions
    const sigParts = [
      status?.source ?? 'x',      // list / tournament if API provided
      status?.phase ?? 'idle',
      String(status?.position ?? status?.queuePosition ?? ''),
      String(getTableNumber(status) ?? ''),
    ];
    const nextSig = sigParts.join('|');

    let prevSig = '';
    try { prevSig = localStorage.getItem(LS_KEY_LAST_SIG) || ''; } catch {}

    if (!nextSig || nextSig === prevSig) return;

    try { localStorage.setItem(LS_KEY_LAST_SIG, nextSig); } catch {}
    if (!acquireWindowLock()) return;

    await Promise.resolve();
    try { prevSig = localStorage.getItem(LS_KEY_LAST_SIG) || ''; } catch {}
    if (prevSig !== nextSig) return;

    // cross-tab spacing
    try {
      const lastFire = Number(localStorage.getItem(LS_KEY_LAST_FIRE) || 0);
      const now = Date.now();
      if (now - lastFire < 1200) return;
      localStorage.setItem(LS_KEY_LAST_FIRE, String(now));
    } catch {}

    // Decide the banner
    if (isOnTable(status)) {
      const tableNo = getTableNumber(status);
      const fallback = tableNo ? `Your in table (#${tableNo})` : `Your in table`;
      const msg = resolveMessage(opts.matchReadyMessage, status, fallback);
      fireBanner(msg);
    } else if (isFirstInQueue(status)) {
      const isList = !!listId || status?.source === 'list';
      const fallback = isList ? 'your up next get ready!!' : "You're up next — be ready!";
      const msg = resolveMessage(opts.upNextMessage, status, fallback);
      fireBanner(msg);
    }
  }, [userId, tournamentId, listId, opts.matchReadyMessage, opts.upNextMessage]);

  useEffect(() => {
    if (!userId) return;

    askPermission();
    manualCheck();

    const onVis = () => { if (document.visibilityState === 'visible') manualCheck(); };
    const onFocus = () => manualCheck();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    const onStorage = (e: StorageEvent) => {
      if (e.key === BUMP_KEY || e.key === LS_KEY_LAST_SIG) manualCheck();
    };
    window.addEventListener('storage', onStorage);

    // Tournaments: SSE
    let es: EventSource | null = null;
    if (tournamentId) {
      try {
        es = new EventSource(`/api/tournament/${encodeURIComponent(tournamentId)}/stream`);
        es.onmessage = () => manualCheck();
        es.onerror = () => {};
      } catch {}
    }

    // Lists: fast poll + try attaching to SSE if you add it later
    let int: any = null;
    if (listId) {
      int = setInterval(manualCheck, 800);
      try {
        const esList = new EventSource(`/api/list/${encodeURIComponent(listId)}/stream`);
        esList.onmessage = () => manualCheck();
        esList.onerror = () => {};
        // ensure closed on cleanup
        es = esList;
      } catch {}
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
