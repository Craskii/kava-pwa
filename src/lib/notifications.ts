export type AlertEvent = "UP_NEXT" | "MATCH_READY";

const STORAGE_KEY = "alerts.enabled.v1";

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

export function showSystemNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    requireInteraction: true,
    vibrate: [80, 40, 80],
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: "queue-alert",
  });
}
