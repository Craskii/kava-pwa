'use client';

import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isInstallPromptEvent(e: Event): e is InstallPromptEvent {
  // Narrow by checking for the "prompt" function at runtime
  return typeof (e as Record<string, unknown>).prompt === 'function';
}

function isStandalone(): boolean {
  const mm = typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches === true;

  const legacy =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return Boolean(mm || legacy);
}

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Chromium fires this when the app is installable
      e.preventDefault?.();
      if (isInstallPromptEvent(e)) {
        setDeferredPrompt(e);
        setCanInstall(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () =>
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  useEffect(() => {
    if (isStandalone()) setCanInstall(false);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // accepted or dismissed
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  if (!canInstall) return null;

  return (
    <button
      onClick={onInstall}
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
