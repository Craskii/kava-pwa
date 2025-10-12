'use client';

/**
 * Central alerts store (client-only).
 * - Keeps a single source of truth for "alerts on/off"
 * - Notifies listeners (pages/components/hooks) when state changes or when we "bump" (force re-check)
 * - Re-exports banner helpers for backwards compatibility with older imports
 */

type Listener = () => void;

const LS_KEY = 'alerts_on';

let _enabled: boolean = false;
let _booted = false;
const listeners: Listener[] = [];

function boot() {
  if (_booted) return;
  _booted = true;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    _enabled = raw === '1';
  } catch {}
}

export function getAlertsEnabled(): boolean {
  boot();
  return _enabled;
}

export function setAlertsEnabled(v: boolean): void {
  boot();
  _enabled = v;
  try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch {}
  emit();
}

function emit() {
  // notify listeners
  for (const l of [...listeners]) {
    try { l(); } catch {}
  }
}

/** Subscribe to on/off changes or manual bumps. Returns unsubscribe fn. */
export function subscribeAlertsChange(fn: Listener): () => void {
  boot();
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Force all listeners to re-check (used after state changes or local, optimistic UI updates). */
export function bumpAlerts(): void {
  boot();
  emit();
}

/* ---- Back-compat re-exports so older imports keep working ---- */
export { ensureNotificationPermission, showSystemNotification } from './notifications';
