"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAlertsEnabled, showSystemNotification } from "@/lib/notifications";

type MeStatus = {
  phase: "idle" | "queued" | "up_next" | "match_ready";
  position?: number | null;
  tableNumber?: number | null;
  bracketRoundName?: string | null;
};

function getMeId(): string | null {
  try {
    const raw = localStorage.getItem("kava_me");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj?.id || null;
  } catch { return null; }
}

async function fetchMeStatus(userId: string, tournamentId?: string): Promise<MeStatus> {
  const qs = new URLSearchParams();
  qs.set("userId", userId);
  if (tournamentId) qs.set("tournamentId", tournamentId);
  const res = await fetch(`/api/me/status?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("status fetch failed");
  return res.json();
}

export function useQueueAlerts(opts: { tournamentId?: string }) {
  const { tournamentId } = opts;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastFiredRef = useRef<"UP_NEXT" | "MATCH_READY" | null>(null);
  const [status, setStatus] = useState<MeStatus | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = document.createElement("audio");
    a.src = "/sounds/up-next.mp3";
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    audioRef.current = a;
  }, []);

  const playSound = useCallback(async () => {
    try {
      await audioRef.current?.play();
      if (audioRef.current) audioRef.current.currentTime = 0;
    } catch {}
  }, []);

  const fire = useCallback(async (kind: "UP_NEXT" | "MATCH_READY", detail?: string) => {
    if (!getAlertsEnabled()) return;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (!hidden) await playSound();

    const title = kind === "UP_NEXT" ? "You're up next!" : "Your match is ready!";
    const body = detail ?? (kind === "UP_NEXT" ? "Head to your table." : "Please report to the assigned table.");
    showSystemNotification(title, body);

    lastFiredRef.current = kind;
  }, [playSound]);

  useEffect(() => {
    let stop = false;
    let delay = 5000;

    async function tick() {
      try {
        const userId = getMeId();
        if (!userId) { delay = 10000; if (!stop) setTimeout(tick, delay); return; }

        const s = await fetchMeStatus(userId, tournamentId);
        setStatus(s);

        if (s.phase === "up_next") {
          if (lastFiredRef.current !== "UP_NEXT") {
            await fire("UP_NEXT", "You're next in line. Please get ready.");
          }
        } else if (s.phase === "match_ready") {
          if (lastFiredRef.current !== "MATCH_READY") {
            const d = s.tableNumber
              ? `Your match is ready at Table ${s.tableNumber}${s.bracketRoundName ? " — " + s.bracketRoundName : ""}.`
              : `Your match is ready${s.bracketRoundName ? " — " + s.bracketRoundName : ""}.`;
            await fire("MATCH_READY", d);
          }
        } else {
          lastFiredRef.current = null;
        }

        delay = s.phase === "idle" ? 10000 : 5000;
      } catch {
        delay = 10000;
      }
      if (!stop) setTimeout(tick, delay);
    }

    tick();
    return () => { stop = true; };
  }, [tournamentId, fire]);

  return { status };
}
