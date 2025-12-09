'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { showSystemNotification } from '@/lib/notifications';

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

async function fireBannerAdvanced(status: any, text: string) {
  const title = status?.source === 'list' ? 'Queue update' : 'Match update';
  const shown = await showSystemNotification(title, text, {
    tag: 'kava-alert',
    renotify: true,
    url: status?.url || status?.deepLink,
  });
  if (!shown) showInAppBanner(text);
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

function acquireWindowLock(ms = 1500): boolean {
  const now = Date.now();
  const until = window.__kavaAlertLockUntil || 0;
  if (now < until) return false;
  window.__kavaAlertLockUntil = now + ms;
  return true;
}
function shouldSkipCheck(): boolean {
  const now = Date.now();
  const last = window.__kavaLastCheckAt || 0;
  if (now - last < 250) return true;
  window.__kavaLastCheckAt = now;
  return false;
}

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
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch { return null; }
  }, []);
  const userId = me?.id;
  const inFlight = useRef(false);
  const timerRef = useRef<number | null>(null);

  const manualCheck = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (!alertsEnabled() || !userId) return;
      if (shouldSkipCheck()) return;

      const status = await fetchStatus({ userId, tournamentId, listId });

      const sigParts = [
        status?.source ?? 'x',
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

      try {
        const last = Number(localStorage.getItem(LS_KEY_LAST_FIRE) || 0);
        const now = Date.now();
        if (now - last < 1200) return;
        localStorage.setItem(LS_KEY_LAST_FIRE, String(now));
      } catch {}

      // (1) Seated / on table
      if (isOnTable(status)) {
        const tableNo = getTableNumber(status);
        const fallback = tableNo ? `Your in table (#${tableNo})` : `Your in table`;
        const msg = resolveMessage(opts.matchReadyMessage, status, fallback);
        await fireBannerAdvanced(status, msg);
        return;
      }

      // (2) Up next
      if (status?.phase === 'up_next') {
        if (status?.source === 'list' || !!listId) {
          await fireBannerAdvanced(status, 'your up next get ready!!');
        } else {
          const roundName =
            status?.bracketRoundName ||
            status?.roundName ||
            (status?.roundNumber != null ? `Round ${status.roundNumber}` : 'this round');
          await fireBannerAdvanced(status, `your up now in ${roundName}!`);
        }
        return;
      }

      // (3) Fallback: first in queue, no explicit phase
      if (isFirstInQueue(status)) {
        const isList = !!listId || status?.source === 'list';
        const fallback = isList ? 'your up next get ready!!' : "You're up next — be ready!";
        const msg = resolveMessage(opts.upNextMessage, status, fallback);
        await fireBannerAdvanced(status, msg);
        return;
      }
    } finally {
      inFlight.current = false;
    }
  }, [userId, tournamentId, listId, opts.matchReadyMessage, opts.upNextMessage]);

  useEffect(() => {
    if (!userId) return;

    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch {}

    const scheduleNext = (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(loop, ms);
    };

    const cadence = () => {
      const visible = document.visibilityState === 'visible';
      return visible ? 1800 : 6500;
    };

    const loop = async () => {
      await manualCheck();
      scheduleNext(cadence());
    };

    loop();

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        manualCheck();
      }
      scheduleNext(cadence());
    };
    const onFocus = () => manualCheck();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    const onStorage = (e: StorageEvent) => {
      if (e.key === BUMP_KEY || e.key === LS_KEY_LAST_SIG) manualCheck();
    };
    window.addEventListener('storage', onStorage);

    // Tournament: keep SSE to wake checks, but let cadence control fetch rate
    let es: EventSource | null = null;
    if (tournamentId) {
      try {
        es = new EventSource(`/api/tournament/${encodeURIComponent(tournamentId)}/stream`);
        es.onmessage = () => manualCheck();
        es.onerror = () => {};
      } catch {}
    }

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      if (es) es.close();
      if (timerRef.current) clearTimeout(timerRef.current);
      inFlight.current = false;
    };
  }, [userId, tournamentId, listId, manualCheck]);

  return { ensurePermissions: () => {} };
}
