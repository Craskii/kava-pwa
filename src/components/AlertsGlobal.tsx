"use client";

import { useEffect } from "react";
import { installAlertsStorageSync, getAlertsEnabled } from "@/lib/alerts";
import { useQueueAlerts } from "@/hooks/useQueueAlerts";

/**
 * Mount once at the app root to:
 *  - keep alerts hook alive
 *  - sync the Alerts toggle across tabs/pages
 */
export default function AlertsGlobal() {
  useQueueAlerts(); // safe no-op until a page configures messages

  useEffect(() => {
    // keep the UI toggles on other pages in sync
    const off = installAlertsStorageSync(() => {
      // nothing else needed here; page-level toggles read from localStorage on render
      // and the hook reacts to bumps.
    });
    // prime cache
    getAlertsEnabled();
    return off;
  }, []);

  return null;
}
