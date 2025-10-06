import InstallPWAButton from './InstallPWAButton';
import IOSInstallTip from './IOSInstallTip';
import HomeActions from '@/components/HomeActions';
import { useStandalone } from '@/components/useStandalone';

export default function Home() {
  // This is a Server Component. We’ll render the installed UI with a tiny client wrapper.
  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        gap: 16,
        fontFamily: 'system-ui, sans-serif',
        padding: 16
      }}
    >
      <ClientHome />
    </main>
  );
}

"use client";
function ClientHome() {
  const standalone = useStandalone();

  if (standalone) {
    // ✅ Installed app → show quick-action Home
    return <HomeActions />;
  }

  // 🌐 Browser (not installed) → your current marketing + install UI
  return (
    <>
      <h1 style={{ fontSize: 28 }}>🏓 Kava Tournaments</h1>
      <p style={{ opacity: 0.8 }}>Create tournaments, queues & get turn alerts.</p>
      <InstallPWAButton />
      <IOSInstallTip />
    </>
  );
}
