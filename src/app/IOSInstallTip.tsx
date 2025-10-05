'use client';

import { useEffect, useState } from 'react';

export default function IOSInstallTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);

    const isStandalone =
      (window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      // legacy iOS flag; cast to any instead of ts-ignore
      (typeof (window.navigator as any).standalone !== 'undefined' &&
        (window.navigator as any).standalone === true);

    if (isIOS && !isStandalone) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        background: '#111827',
        color: 'white',
        padding: '12px 14px',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        fontSize: 14,
        lineHeight: 1.4,
        zIndex: 50,
      }}
    >
      <strong>Install on iPhone:</strong> Tap the Share icon, then
      <strong> Add to Home Screen</strong>.
    </div>
  );
}
