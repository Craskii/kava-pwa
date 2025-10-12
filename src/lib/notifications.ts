'use client';

/**
 * Small helpers around the Notifications API (banners).
 * iOS Safari shows banner silently; sound must be in-app (user gesture).
 */

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch {
    return 'denied';
  }
}

/** Shows a system notification (banner) if allowed. Works best when the PWA/tab is backgrounded. */
export function showSystemNotification(title: string, body?: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    // Using a service worker is ideal, but simple Notification also works in-page
    new Notification(title, { body, silent: true }); // iOS: will be silent anyway
  } catch {}
}
