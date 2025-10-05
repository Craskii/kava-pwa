import InstallPWAButton from './InstallPWAButton';
import IOSInstallTip from './IOSInstallTip';

export default function Home() {
  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        gap: 16,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28 }}>🏓 Kava Tournaments</h1>
      <p style={{ opacity: 0.8 }}>Create tournaments, queues & get turn alerts.</p>

      <InstallPWAButton />
      <IOSInstallTip />
    </main>
  );
}
