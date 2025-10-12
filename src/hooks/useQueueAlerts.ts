"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAlertsEnabled, showSystemNotification } from "@/lib/notifications";

type MeStatus = {
  phase: "idle" | "queued" | "up_next" | "match_ready";
  position?: number | null;
  tableNumber?: number | null;
  bracketRoundName?: string | null;
  sig?: string; // unique signature of the current moment (round/match or table/queue)
};

function getMeId(): string | null {
  try {
    const raw = localStorage.getItem("kava_me");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj?.id || null;
  } catch { return null; }
}

async function fetchMeStatus(params: { userId: string; tournamentId?: string; listId?: string }): Promise<MeStatus> {
  const qs = new URLSearchParams();
  qs.set("userId", params.userId);
  if (params.tournamentId) qs.set("tournamentId", params.tournamentId);
  if (params.listId) qs.set("listId", params.listId);
  const res = await fetch(`/api/me/status?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("status fetch failed");
  return res.json();
}

export function useQueueAlerts(opts: {
  tournamentId?: string;
  listId?: string;
  upNextMessage?: string;
  matchReadyMessage?: (s: MeStatus) => string;
}) {
  const { tournamentId, listId, upNextMessage = "hey you're up next — good luck! :)", matchReadyMessage } = opts;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSigRef = useRef<string | null>(null);
  const [status, setStatus] = useState<MeStatus | null>(null);

  // preload audio
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
    } catch { /* iOS may block if not unlocked by user gesture */ }
  }, []);

  const fire = useCallback(async (kind: "UP_NEXT" | "MATCH_READY", s?: MeStatus) => {
    if (!getAlertsEnabled()) return;

    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (!hidden) await playSound(); // sound only when visible

    const title = kind === "UP_NEXT" ? "You're up next!" : "Your match is ready!";
    const detail = kind === "UP_NEXT"
      ? upNextMessage
      : (matchReadyMessage ? matchReadyMessage(s || {}) :
          (s?.tableNumber ? `Your match is ready at Table ${s.tableNumber}${s?.bracketRoundName ? " — " + s.bracketRoundName : ""}.`
                           : `Your match is ready${s?.bracketRoundName ? " — " + s.bracketRoundName : ""}.`));

    showSystemNotification(title, detail);
  }, [playSound, upNextMessage, matchReadyMessage]);

  // polling + bump
  useEffect(() => {
    let stop = false;
    let timer: any = null;

    async function tick(immediate = false) {
      try {
        const userId = getMeId();
        if (!userId) { schedule(1500); return; }

        const s = await fetchMeStatus({ userId, tournamentId, listId });
        setStatus(s);

        // de-dupe: only fire when signature changes into an active phase
        const sig = s.sig || `${s.phase}`;
        const isActive = s.phase === "up_next" || s.phase === "match_ready";
        if (isActive && sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          await fire(s.phase === "up_next" ? "UP_NEXT" : "MATCH_READY", s);
        } else if (!isActive) {
          lastSigRef.current = null;
        }

        // fast while active, slower otherwise
        schedule(s.phase === "idle" ? 3000 : 1000);
      } catch {
        schedule(3000);
      }
    }

    function schedule(ms: number) {
      if (stop) return;
      clearTimeout(timer);
      timer = setTimeout(() => tick(false), ms);
    }

    // initial + listeners to “bump” immediately
    tick(true);
    const bump = () => tick(true);
    window.addEventListener("visibilitychange", bump);
    window.addEventListener("alerts:bump", bump);

    return () => {
      stop = true;
      clearTimeout(timer);
      window.removeEventListener("visibilitychange", bump);
      window.removeEventListener("alerts:bump", bump);
    };
  }, [tournamentId, listId, fire]);

  return { status };
}
