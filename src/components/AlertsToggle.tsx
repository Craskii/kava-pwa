"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureNotificationPermission, getAlertsEnabled, setAlertsEnabled, showSystemNotification } from "@/lib/notifications";

export default function AlertsToggle() {
  const [enabled, setEnabled] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setEnabled(getAlertsEnabled());
    if (typeof window !== "undefined" && "Notification" in window) {
      setPerm(Notification.permission);
    }
  }, []);

  // Preload audio element
  const audioEl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const a = document.createElement("audio");
    a.src = "/sounds/up-next.mp3";
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    return a;
  }, []);
  useEffect(() => { audioRef.current = audioEl; }, [audioEl]);

  async function onToggle() {
    const next = !enabled;
    if (next) {
      const p = await ensureNotificationPermission();
      setPerm(p);
      // iOS requires a user gesture to unlock audio
      try {
        await audioRef.current?.play();
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
      } catch {}
    }
    setAlertsEnabled(next);
    setEnabled(next);
  }

  async function testSound() {
    try {
      await audioRef.current?.play();
      if (audioRef.current) audioRef.current.currentTime = 0;
    } catch {
      alert("iPhone blocks sound until you tap the toggle once and your device is not in Silent mode.");
    }
  }

  function testBanner() {
    // This shows a system notification when the tab/app is backgrounded.
    // Note: iOS will show banner silently (no sound).
    showSystemNotification("Test Banner", "If you background Safari/PWA, this should appear as a banner.");
  }

  const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
  const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" };
  const primary: React.CSSProperties = { ...btn, border: "none", background: "#0ea5e9" };

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <div style={row}>
        <button onClick={onToggle} aria-pressed={enabled} style={enabled ? primary : btn}>
          {enabled ? "Alerts: ON" : "Alerts: OFF"}
        </button>
        <button onClick={testSound} style={btn} title="Plays the ding now">Test Sound</button>
        <button onClick={testBanner} style={btn} title="Shows a banner when app is backgrounded">Test Banner</button>
      </div>
      <div style={{ opacity: .7, fontSize: 12, maxWidth: 360, textAlign: "right" }}>
        {perm !== "granted" ? "Allow Notifications to see banners." : "Banners show when the app/tab is in background. iPhone plays no sound for banners."}
      </div>
    </div>
  );
}
