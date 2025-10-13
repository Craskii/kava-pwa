import Link from "next/link";
import InstallPWAButton from "./InstallPWAButton";
import IOSInstallTip from "./IOSInstallTip";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        padding: "24px",
        background: "linear-gradient(180deg,#0b0b0b, #111, #0b0b0b)",
        color: "white",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: "#0ea5e9",
          }}
        >
          🏓
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>Kava Tournaments</h1>
      </header>

      {/* Main actions */}
      <section
        style={{
          display: "grid",
          gap: 16,
          alignContent: "center",
          maxWidth: 560,
          width: "100%",
          justifySelf: "center",
        }}
      >
        <Link href="/me" style={btnGhost}>🧑‍💼 My tournaments</Link>
        <Link href="/lists" style={btnGhost}>📝 My lists</Link>
        <Link href="/create" style={btnPrimary}>➕ Create game</Link>
        <Link href="/join" style={btnGhost}>🔐 Join with code</Link>
        <Link href="/nearby" style={btnGhost}>📍 Find nearby</Link>

        {/* PWA install helpers */}
        <div style={{ justifySelf: "center", marginTop: 6 }}>
          <InstallPWAButton />
        </div>
        <IOSInstallTip />

        <p style={{ opacity: 0.8, textAlign: "center", marginTop: 4 }}>
          Create brackets and list games, manage queues, and send “you’re up next” alerts.
        </p>
      </section>

      {/* Footer */}
      <footer style={{ opacity: 0.6, textAlign: "center", fontSize: 12 }}>
        v0 • PWA ready • Works offline
      </footer>
    </main>
  );
}

const btnBase: React.CSSProperties = {
  padding: "16px 18px",
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 600,
  textAlign: "center",
  display: "block",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "#0ea5e9",
  color: "white",
};

const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
};
