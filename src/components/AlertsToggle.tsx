"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureNotificationPermission, getAlertsEnabled, setAlertsEnabled } from "@/lib/notifications";

export default function AlertsToggle() {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => setEnabled(getAlertsEnabled()), []);

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
      await ensureNotificationPermission();
      try {
        await audioRef.current?.play();
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
      } catch {}
    }
    setAlertsEnabled(next);
    setEnabled(next);
  }

  const btn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: enabled ? "none" : "1px solid rgba(255,255,255,0.25)",
    background: enabled ? "#0ea5e9" : "transparent",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <button onClick={onToggle} aria-pressed={enabled} style={btn} title="Enable sound + system notifications">
      {enabled ? "Alerts: ON" : "Alerts: OFF"}
    </button>
  );
}
