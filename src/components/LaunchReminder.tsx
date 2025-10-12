"use client";

import { useEffect, useState } from "react";
import { ensureNotificationPermission } from "@/lib/notifications";
import { getAlertsEnabled, setAlertsEnabled } from "@/lib/alerts";

export default function LaunchReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const enabled = getAlertsEnabled();
      const dismissed = localStorage.getItem("kava_alerts_prompt_dismissed") === "1";
      // Show if not enabled and not dismissed
      setShow(!enabled && !dismissed);
    } catch {
      setShow(false);
    }
  }, []);

  if (!show) return null;

  async function onEnable() {
    try {
      const p = await ensureNotificationPermission();
      if (p === "granted") {
        setAlertsEnabled(true);
        setShow(false);
      }
    } catch {
      // ignore
    }
  }

  function onDismiss() {
    try { localStorage.setItem("kava_alerts_prompt_dismissed", "1"); } catch {}
    setShow(false);
  }

  const box: React.CSSProperties = {
    position: "fixed",
    left: 12, right: 12, bottom: 12,
    zIndex: 9999,
    background: "rgba(17,17,17,.92)",
    border: "1px solid rgba(255,255,255,.15)",
    borderRadius: 12,
    padding: "12px 14px",
    color: "#fff",
    backdropFilter: "blur(6px)"
  };
  const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" };
  const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" };
  const primary: React.CSSProperties = { ...btn, border: "none", background: "#0ea5e9" };

  return (
    <div style={box} role="dialog" aria-live="polite">
      <div style={row}>
        <div style={{maxWidth: 420}}>
          <div style={{fontWeight: 700, marginBottom: 4}}>Turn on alerts</div>
          <div style={{opacity:.85, fontSize: 14}}>
            Enable notifications so we can banner you when you’re up next.
          </div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button style={btn} onClick={onDismiss}>Later</button>
          <button style={primary} onClick={onEnable}>Enable alerts</button>
        </div>
      </div>
    </div>
  );
}
