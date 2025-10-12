"use client";

import { useEffect } from "react";
import { useQueueAlerts } from "@/hooks/useQueueAlerts";

/**
 * Mount once at the app root to keep the alerts machinery alive
 * (storage sync, audio warm-up, background poll kick, etc).
 * The hook no-ops unless a page passes options elsewhere.
 */
export default function AlertsGlobal() {
  // The hook internally guards when called with no options.
  useQueueAlerts();
  useEffect(() => {
    // nothing else — just ensuring client execution
  }, []);
  return null;
}
