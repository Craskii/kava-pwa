"use client";
import { useEffect, useRef, useState } from "react";

export default function DebugPanel() {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: CustomEvent) => {
      setLines((prev) => [...prev.slice(-200), e.detail]);
      ref.current?.scrollTo(0, ref.current.scrollHeight);
    };
    // @ts-ignore
    window.addEventListener("room-debug", handler as any);
    return () => {
      // @ts-ignore
      window.removeEventListener("room-debug", handler as any);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        bottom: 10,
        right: 10,
        width: 360,
        maxHeight: 240,
        overflow: "auto",
        background: "rgba(0,0,0,.75)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 12,
        padding: 8,
        borderRadius: 8,
        border: "1px solid rgba(0,255,0,.3)",
        zIndex: 99999,
      }}
    >
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

// helper to emit lines
export function debugLine(s: string) {
  if (typeof window === "undefined") return;
  const ev = new CustomEvent("room-debug", { detail: s });
  window.dispatchEvent(ev);
}
