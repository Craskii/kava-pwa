// src/lib/me.ts
// A tiny client-safe identity helper.
// NOTE: This module is imported by client components; it must never hard-crash on the server.

export type Me = { id: string; name: string };

export function uid(): string {
  try {
    // @ts-ignore (edge/runtime)
    return crypto.randomUUID();
  } catch {
    return "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Safe on client; on server returns a placeholder (only call in 'use client' files). */
export function getOrCreateMe(defaultName = "Player"): Me {
  if (typeof window === "undefined") {
    // Server render path: return a placeholder; real value will hydrate on client.
    return { id: "", name: defaultName };
  }
  try {
    const raw = localStorage.getItem("kava_me");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.name) return parsed as Me;
    }
  } catch {}
  const me: Me = { id: uid(), name: defaultName };
  try { localStorage.setItem("kava_me", JSON.stringify(me)); } catch {}
  return me;
}

export function setMyName(name: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("kava_me");
    const cur = raw ? JSON.parse(raw) : { id: uid(), name: "Player" };
    const next = { id: cur.id, name: (name || "Player").trim() };
    localStorage.setItem("kava_me", JSON.stringify(next));
  } catch {}
}

export function getMe(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("kava_me");
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p?.id && p?.name ? (p as Me) : null;
  } catch { return null; }
}
