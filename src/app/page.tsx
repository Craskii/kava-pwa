// src/app/page.tsx
'use client';
export const runtime = 'edge';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Handles "Install PWA" prompt (only shows on desktop/Android, never iPhone)
function useInstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [isStandalone, setStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      (typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches ||
          // iOS Safari detection
          (navigator as any).standalone === true)) ||
      false;
    setStandalone(standalone);

    function onBeforeInstallPrompt(e: any) {
      e.preventDefault();
      setDeferred(e);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const canInstall = !!deferred && !isStandalone;

  async function promptInstall() {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  }

  return { canInstall, promptInstall };
}

export default function Home() {
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <main style={wrap} suppressHydrationWarning>
      <header style={header}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={appDot} aria-hidden />
          <h1 style={h1}>Kava Tournaments</h1>
        </div>
      </header>

      <section style={panel}>
        {/* ✅ Correct labels and routes */}
        <HomeButton href="/tournaments" label="🧑‍⚖️  My tournaments" />
        <HomeButton href="/lists" label="🧾  My lists" />
        <HomeButton href="/create" label="+  Create game" primary />
        <HomeButton href="/join" label="🔒  Join with code" />
        <HomeButton href="/nearby" label="📍  Find nearby" />
      </section>

      {/* ✅ Only shows if installable on desktop/Android */}
      {canInstall && (
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 18 }}>
          <button onClick={promptInstall} style={installBtn}>
            Install Kava Tournaments
          </button>
        </div>
      )}

      <footer style={foot}>
        Create brackets and list games, manage queues, and send “you’re up next” alerts.
        <div style={{ opacity: 0.6, marginTop: 4 }}>v0 · PWA ready · Works offline</div>
      </footer>
    </main>
  );
}

/* ===========================
   COMPONENTS + STYLES
=========================== */

function HomeButton({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link href={href} prefetch={false} style={primary ? btnPrimary : btn}>
      {label}
    </Link>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  fontFamily: 'system-ui',
  padding: '28px 16px',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  gap: 18,
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const appDot: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
  boxShadow: '0 0 0 1px rgba(255,255,255,.15) inset',
};

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
};

const panel: React.CSSProperties = {
  maxWidth: 720,
  width: '100%',
  margin: '0 auto',
  display: 'grid',
  gap: 12,
};

const btn: React.CSSProperties = {
  display: 'block',
  padding: '18px 16px',
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 14,
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  textAlign: 'left',
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#0ea5e9',
  border: 'none',
  textAlign: 'center',
};

const installBtn: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const foot: React.CSSProperties = {
  textAlign: 'center',
  opacity: 0.9,
  maxWidth: 780,
  margin: '0 auto',
};
