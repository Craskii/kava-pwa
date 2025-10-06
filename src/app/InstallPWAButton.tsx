'use client';

import { useEffect, useMemo, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function hasPrompt(x: unknown): x is { prompt: () => void } {
  return typeof (x as { prompt?: unknown }).prompt === 'function';
}
function isInstallPromptEvent(e: Event): e is InstallPromptEvent {
  return hasPrompt(e);
}
function isStandalone(): boolean {
  const mm =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  const legacy =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mm || legacy);
}
function isAndroid(): boolean {
  return /android/.test(navigator.userAgent.toLowerCase());
}

export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const android = useMemo(isAndroid, []);

  // Capture install prompt when eligible
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      if (isInstallPromptEvent(e)) setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () =>
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  // Hide UI if already installed
  useEffect(() => {
    if (isStandalone()) setInstalled(true);
  }, []);

  if (installed) return null;

  // If install prompt is available, show the button
  if (deferred) {
    return (
      <button
        onClick={async () => {
          deferred.prompt();
          await deferred.userChoice; // accepted/dismissed
          setDeferred(null);
        }}
        style={{
          padding: '12px 18px',
          borderRadius: 12,
          border: 'none',
          background: '#0ea5e9',
          color: 'white',
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        Install Kava Tournaments
      </button>
    );
  }

  // Fallback: Android Chrome sometimes won’t fire the prompt yet.
  // Show friendly instructions.
  if (android) {
    return (
      <div
        style={{
          background: '#0b1220',
          color: 'white',
          padding: '12px 14px',
          borderRadius: 12,
          maxWidth: 520,
        }}
      >
        <strong>Install on Android</strong>
        <ol style={{ margin: '8px 0 0 18px', lineHeight: 1.6 }}>
          <li>Tap the <b>⋮</b> menu in the top-right corner.</li>
          <li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
          <li>Tap <b>Install</b>.</li>
        </ol>
        <div style={{ opacity: 0.8, marginTop: 8, fontSize: 12 }}>
          Tip: If you don’t see it yet, browse the site a bit and come back.
        </div>
      </div>
    );
  }

  // Non-Android and not installable yet → show nothing (iOS gets its own banner)
  return null;
}
