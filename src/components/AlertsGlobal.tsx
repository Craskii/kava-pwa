// src/components/AlertsGlobal.tsx
'use client';
import { useEffect } from 'react';
import { useQueueAlerts } from '@/lib/alerts';

// Mounts a global poller with no IDs, letting the server
// pick the most relevant context for the user (latest list or tournament).
export default function AlertsGlobal() {
  useEffect(() => {
    // No IDs => /api/me/status fallback logic kicks in
    useQueueAlerts({
      // Explicit safe defaults (no "You're up")
      upNextMessage: 'your up next get ready!!',
      matchReadyMessage: 'Your in table',
    });
  }, []);
  return null;
}
