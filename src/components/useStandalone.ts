"use client";
import { useEffect, useState } from "react";

export function useStandalone() {
  const [isStandalone, set] = useState(false);

  useEffect(() => {
    const check = () =>
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      // iOS Safari (PWA)
      (navigator as any).standalone === true;

    set(check());

    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onChange = () => set(check());
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  return isStandalone;
}
