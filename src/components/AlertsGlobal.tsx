'use client';
import { useEffect } from 'react';
import { useQueueAlerts } from '@/lib/alerts';

// Mounts a global poller with no IDs, letting the server
// pick the most relevant context for the user (latest list or tournament).
export default function AlertsGlobal() {
  useEffect(() => {
    // No IDs => /api/me/status fallback logic kicks in
    useQueueAlerts({
      upNextMessage: "You're up!",
      matchReadyMessage: () => "You're up!"
    });
  }, []);
  return null;
}
