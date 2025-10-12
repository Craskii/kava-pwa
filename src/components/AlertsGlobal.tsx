'use client';

import { useEffect } from 'react';
import { useQueueAlerts } from '@/hooks/useQueueAlerts';

/**
 * Mount once in layout to keep background polling alive,
 * even on home screen. Global scope only (no ids).
 */
export default function AlertsGlobal() {
  useQueueAlerts({
    upNextMessage: () => "You're up next — be ready!",
    matchReadyMessage: () => "OK — you're up on the table!",
  });

  // nothing to render
  useEffect(() => {}, []);
  return null;
}
