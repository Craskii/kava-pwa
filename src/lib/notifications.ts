// src/lib/notifications.ts
// Small helpers for permission + system banners – no sound on iOS banners.

import { getAlertsEnabled, setAlertsEnabled } from "./alerts";

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  const cur = Notification.permission;
  if (cur === "granted" || cur === "denied") return cur;
  try {
    const req = await Notification.requestPermission();
    return req;
  } catch {
    return "denied";
  }
}

export function showSystemNotification(title: string, body?: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // Note: iOS shows a silent banner; Android/desktop may play system sound.
    new Notification(title, { body, tag: "kava-alert", renotify: true });
  } catch {
    /* noop */
  }
}

/** Convenience re-exports so components don’t need to know the alerts store names */
export const getAlertsOn = getAlertsEnabled;
export const setAlertsOn = setAlertsEnabled;
