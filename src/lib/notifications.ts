export type AlertEvent = "UP_NEXT" | "MATCH_READY";

const STORAGE_KEY = "alerts.enabled.v1";
const ICON_PATH = "/icons/icon-192x192.png";

export function getAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}
export function setAlertsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

export async function showSystemNotification(
  title: string,
  body: string,
  opts: Partial<NotificationOptions & { url?: string }> = {}
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const payload: NotificationOptions & { data?: any } = {
    body,
    requireInteraction: true,
    vibrate: [80, 40, 80],
    icon: ICON_PATH,
    badge: ICON_PATH,
    tag: "queue-alert",
    renotify: true,
    data: opts.url ? { url: opts.url } : undefined,
    ...opts,
  };

  // Prefer the SW path so banners work when the PWA is backgrounded.
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      const active = reg?.active;
      if (active) {
        active.postMessage({ type: "SHOW_NOTIFICATION", payload: { title, body, ...payload } });
        return true;
      }
      if (reg.showNotification) {
        await reg.showNotification(title, payload);
        return true;
      }
    }
  } catch {}

  try {
    new Notification(title, payload);
    return true;
  } catch {}

  return false;
}
