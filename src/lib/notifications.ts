// src/lib/notifications.ts
'use client';

import {
  areAlertsOn, setAlertsOn, enableAlerts, showBanner, ensurePermission
} from './alerts';

export function getAlertsEnabled() { return areAlertsOn(); }
export function setAlertsEnabled(next: boolean) { setAlertsOn(next); }

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  return await ensurePermission();
}

// For “Test Banner”
export function showSystemNotification(title: string, body?: string) {
  showBanner(body ?? title, body ? title : 'Kava');
}
