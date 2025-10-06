'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)').matches === true;
  const legacy =
    (typeof navigator !== 'undefined' &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return Boolean(mm || legacy);
}

export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [android, setAndroid] = useState(false);

  // Detect Android after mount
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setAndroid(/android/.test(navigator.userAgent.toLowerCase()));
    }
  }, []);

  // Capture install prompt when eligible
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault?.();
      const maybe = e as Partial<InstallPromptEvent>;
      if (typeof maybe.prompt === 'function') {
        setDeferred(e as InstallPromptEvent);
      }
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () =>
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  // Hide if already installed
  useEffect(() => {
    if (isStandalone()) setInstalled(true);
  }, []);

  if (installed) return null;

  if (deferred) {
    return (
      <button
        onClick={async () => {
          deferred.prompt();
          await deferred.userChoice;
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

  // Android fallback instructions
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
          <li>Tap the <b>⋮</b> menu (top-right).</li>
          <li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
          <li>Tap <b>Install</b>.</li>
        </ol>
        <div style={{ opacity: 0.8, marginTop: 8, fontSize: 12 }}>
          Tip: If you don’t see it yet, browse around and come back.
        </div>
      </div>
    );
  }

  return null;
}
