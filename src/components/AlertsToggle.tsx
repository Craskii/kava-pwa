"use client";
import { useSyncExternalStore, useEffect, useMemo, useRef, useState } from "react";
import {
  areAlertsOn, subscribeAlerts, enableAlerts, disableAlerts, showBanner
} from "@/lib/alerts";

// If you still want a “Test Sound”, keep your audio preload here; otherwise remove.
export default function AlertsToggle() {
  const on = useSyncExternalStore(subscribeAlerts, areAlertsOn, () => false);
  const [perm, setPerm] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPerm(Notification.permission);
    }
  }, [on]);

  const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" };
  const primary: React.CSSProperties = { ...btn, border: "none", background: on ? "#22c55e" : "#0ea5e9" };

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => (on ? disableAlerts() : enableAlerts())}
          aria-pressed={on}
          style={primary}
        >
          Alerts: {on ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => showBanner("This is a test banner.")}
          style={btn}
          title="Shows a banner when app is backgrounded"
        >
          Test Banner
        </button>
      </div>
      <div style={{ opacity: .7, fontSize: 12, maxWidth: 360, textAlign: "right" }}>
        {perm !== "granted"
          ? "Allow Notifications to see banners."
          : "Banners show when the app/tab is in background. iPhone plays no sound for banners."}
      </div>
    </div>
  );
}
