// src/lib/alerts.ts
'use client';

/**
 * Global alerts state + utilities (no imports from hooks here!)
 * Hooks may import from this file, but this file never imports hooks.
 */

const LS_KEY = 'kava_alerts_on';
const CHAN = 'kava-alerts';

let bc: BroadcastChannel | null = null;
function channel() {
  if (typeof window === 'undefined') return null;
  try {
    if (!bc) bc = new BroadcastChannel(CHAN);
  } catch {
    // older Safari may not support BroadcastChannel
  }
  return bc;
}

export function getAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}

export function setAlertsEnabled(on: boolean) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch {}
  try { channel()?.postMessage({ type: 'alerts-changed', on }); } catch {}
  try { window.dispatchEvent(new CustomEvent('kava:alerts-changed', { detail: { on } })); } catch {}
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'default';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch { return 'default'; }
}

export function subscribeAlertsChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) cb(); };
  const onDom = () => cb();
  const c = channel();
  const onMsg = () => cb();

  window.addEventListener('storage', onStorage);
  window.addEventListener('kava:alerts-changed', onDom as EventListener);
  c?.addEventListener?.('message', onMsg as any);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('kava:alerts-changed', onDom as EventListener);
    c?.removeEventListener?.('message', onMsg as any);
  };
}

export function bumpAlertsSignal() {
  try { channel()?.postMessage({ type: 'alerts-bump' }); } catch {}
  try { window.dispatchEvent(new CustomEvent('kava:alerts-bump')); } catch {}
}

export function showSystemNotification(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/icon-192.png' }); } catch {}
}
