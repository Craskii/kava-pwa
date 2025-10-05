'use client';

import { useEffect, useState } from 'react';

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);
    console.log('Install choice:', choice.outcome);
  };

  useEffect(() => {
    const isStandalone =
      (window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      // @ts-ignore
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

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => void;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}
