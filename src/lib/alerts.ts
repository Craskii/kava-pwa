// src/lib/alerts.ts
// Central "alerts enabled" state + a small "bump" broadcaster to wake the alerts hook.

const LS_KEY = "kava_alerts_enabled";
const BUMP_EVENT = "kava-alerts-bump";

let cachedEnabled: boolean | null = null;

export function getAlertsEnabled(): boolean {
  try {
    if (cachedEnabled === null) {
      const raw = localStorage.getItem(LS_KEY);
      cachedEnabled = raw === "1";
    }
    return !!cachedEnabled;
  } catch {
    return false;
  }
}

export function setAlertsEnabled(on: boolean) {
  try {
    localStorage.setItem(LS_KEY, on ? "1" : "0");
    cachedEnabled = on;
    // cross-tab sync
    try {
      localStorage.setItem("__alerts_sync__", String(Date.now()));
      localStorage.removeItem("__alerts_sync__");
    } catch {}
    // same-tab listeners
    window.dispatchEvent(new CustomEvent("kava-alerts-toggle", { detail: { on } }));
  } catch {}
}

/**
 * Wake up the global alerts loop immediately (e.g., after state-changing actions).
 * Pages listening for this event should poll /api/me/status right away.
 */
export function bumpAlerts() {
  try {
    window.dispatchEvent(new Event(BUMP_EVENT));
  } catch {}
}

/** Allow other modules to subscribe if needed */
export function onAlertsBump(fn: () => void) {
  const handler = () => fn();
  window.addEventListener(BUMP_EVENT, handler);
  return () => window.removeEventListener(BUMP_EVENT, handler);
}

/** Utility used by the global component to live-sync the toggle across tabs */
export function installAlertsStorageSync(onChange: (on: boolean) => void) {
  try {
    // storage event = other tab toggled
    const storageHandler = (e: StorageEvent) => {
      if (e.key === LS_KEY) {
        const on = e.newValue === "1";
        cachedEnabled = on;
        onChange(on);
      }
    };
    window.addEventListener("storage", storageHandler);

    // in-tab toggle event
    const localHandler = (e: Event) => {
      const on = getAlertsEnabled();
      onChange(on);
    };
    window.addEventListener("kava-alerts-toggle", localHandler as any);

    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("kava-alerts-toggle", localHandler as any);
    };
  } catch {
    return () => {};
  }
}
