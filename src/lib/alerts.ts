// src/lib/alerts.ts
'use client';

/**
 * Cross-page Alerts state + helpers
 * (and re-exports of existing hooks so older imports keep working)
 */

import {
  useQueueAlerts,
  useTournamentAlerts,
  bumpAlerts as bumpFromHooks,
} from '@/hooks/useQueueAlerts';

// --- public re-exports (back-compat) ---
export { useQueueAlerts, useTournamentAlerts, bumpFromHooks as bumpAlerts };

// --- lightweight global store for ON/OFF + banner helpers ---

const LS_KEY = 'kava_alerts_on';
const CHAN = 'kava-alerts';

let bc: BroadcastChannel | null = null;
function channel() {
  if (typeof window === 'undefined') return null;
  try {
    if (!bc) bc = new BroadcastChannel(CHAN);
  } catch {
    // Older iOS may lack BroadcastChannel; we'll also emit a DOM event.
  }
  return bc;
}

export function areAlertsOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAlertsOn(next: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, next ? '1' : '0');
  } catch {}

  try {
    channel()?.postMessage({ type: 'alerts-changed', on: next });
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('kava:alerts-changed', { detail: { on: next } }));
  } catch {}
}

export async function ensurePermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'default';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}

export async function enableAlerts(): Promise<boolean> {
  const p = await ensurePermission();
  const ok = p === 'granted';
  setAlertsOn(ok);
  return ok;
}

export function disableAlerts() {
  setAlertsOn(false);
}

export function subscribeAlerts(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY) cb();
  };
  const c = channel();
  const onMsg = () => cb();
  const onDom = () => cb();

  window.addEventListener('storage', onStorage);
  window.addEventListener('kava:alerts-changed', onDom as EventListener);
  c?.addEventListener?.('message', onMsg as any);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('kava:alerts-changed', onDom as EventListener);
    c?.removeEventListener?.('message', onMsg as any);
  };
}

/**
 * Global “bump” signal for immediately re-checking status on all tabs.
 * Name it bumpSignal internally to avoid clashing with the hook’s bumpAlerts export.
 */
export function bumpSignal() {
  try {
    channel()?.postMessage({ type: 'alerts-bump' });
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('kava:alerts-bump'));
  } catch {}
}

export function showBanner(body: string, title = 'Kava') {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon-192.png' });
  } catch {}
}
