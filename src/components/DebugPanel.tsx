"use client";
import { useEffect, useRef, useState } from "react";

export default function DebugPanel() {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

  useEffect(() => {
    if (!enabled) return;

    const push = (line: string) => {
      setLines((prev) => [...prev.slice(-300), line]);
      ref.current?.scrollTo(0, ref.current.scrollHeight);
    };

    const onCustom = (e: CustomEvent) => push(String(e.detail));

    const onError = (e: ErrorEvent) => push(`[window.onerror] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
    const onRejection = (e: PromiseRejectionEvent) => push(`[unhandledrejection] ${(e.reason?.message ?? e.reason)}`);

    // mirror console.error into panel
    const origError = console.error;
    // @ts-ignore
    console.error = (...args: any[]) => {
      try { push(`[console.error] ${args.map(a => (a?.stack || a?.message || String(a))).join(" ")}`); } catch {}
      origError(...args);
    };

    // @ts-ignore
    window.addEventListener("room-debug", onCustom as any);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      // @ts-ignore
      window.removeEventListener("room-debug", onCustom as any);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = origError;
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
        width: 380,
        maxHeight: 280,
        overflow: "auto",
        background: "rgba(0,0,0,.8)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 12,
        padding: 8,
        borderRadius: 8,
        border: "1px solid rgba(0,255,0,.35)",
        zIndex: 99999,
      }}
    >
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

export function debugLine(s: string) {
  if (typeof window === "undefined") return;
  const ev = new CustomEvent("room-debug", { detail: s });
  window.dispatchEvent(ev);
}
