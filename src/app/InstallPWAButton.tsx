'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function getStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)').matches === true;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true; // iOS
  return Boolean(mm || legacy);
}

export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [android, setAndroid] = useState(false);

  // Detect platform
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setAndroid(/android/.test(navigator.userAgent.toLowerCase()));
    }
  }, []);

  // Track standalone state (and react to changes)
  useEffect(() => {
    setInstalled(getStandalone());
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onChange = () => setInstalled(getStandalone());
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  // Capture install prompt when eligible
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Some browsers may fire this more than once on SPA navigations
      e.preventDefault?.();
      const maybe = e as Partial<InstallPromptEvent>;
      if (typeof maybe.prompt === 'function') {
        setDeferred(e as InstallPromptEvent);
      }
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
  }, []);

  // Hide when installed from any path (menu, prompt, etc.)
  useEffect(() => {
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  if (installed) return null;

  if (deferred) {
    return (
      <button
        onClick={async () => {
          deferred.prompt();
          try {
            await deferred.userChoice;
          } finally {
            // Chrome recommends clearing our saved event after use
            setDeferred(null);
          }
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

  // Android fallback instructions (when prompt isn't available yet)
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
