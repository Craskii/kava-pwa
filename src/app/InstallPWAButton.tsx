'use client';

import { useEffect, useState } from 'react';

// Use a LOCAL type alias (no global declaration)
type InstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault?.();
      setDeferredPrompt(e as InstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () =>
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // accepted or dismissed
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  // Hide button if already installed (standalone)
  useEffect(() => {
    const isStandalone =
      (window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      // @ts-ignore (iOS Safari legacy flag)
      window.navigator.standalone === true;
    if (isStandalone) setCanInstall(false);
  }, []);

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
