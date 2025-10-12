// src/app/page.tsx
export const runtime = 'edge';

import Link from "next/link";

export default function Home() {
  return (
    <main style={wrap}>
      <div style={center}>
        <div style={brandRow}>
          <img src="/icon-192.png" alt="" width={24} height={24} style={{borderRadius:6}} />
          <h1 style={title}>Kava Tournaments</h1>
        </div>

        <nav style={nav}>
          <BigButton href="/me">👤 My tournaments</BigButton>
          <BigButton href="/me">📄 My lists</BigButton>
          <BigButton href="/create" primary>➕ Create game</BigButton>
          <BigButton href="/join">🔐 Join with code</BigButton>
          <BigButton href="/nearby">📍 Find nearby</BigButton>
        </nav>

        <div style={installHint}>
          <a href="/manifest.webmanifest" style={installBtn}>Install Kava Tournaments</a>
        </div>

        <p style={blurb}>
          Create brackets and list games, manage queues, and send “you’re up next”
          alerts.
        </p>

        <div style={foot}>v0 · PWA ready · Works offline</div>
      </div>
    </main>
  );
}

/* ---------- components ---------- */
function BigButton({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        ...bigBtn,
        ...(primary ? bigBtnPrimary : {}),
      }}
    >
      {children}
    </Link>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0b",
  color: "#fff",
  fontFamily: "system-ui",
  padding: 24,
  display: "grid",
  placeItems: "center",
};

const center: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  margin: "0 auto",
  textAlign: "center",
};

const brandRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 18,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
};

const nav: React.CSSProperties = {
  display: "grid",
  gap: 12,
  margin: "0 auto",
};

const bigBtn: React.CSSProperties = {
  display: "block",
  padding: "16px 18px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
  textDecoration: "none",
  borderRadius: 14,
  fontWeight: 700,
};

const bigBtnPrimary: React.CSSProperties = {
  background: "#0ea5e9",
  border: "none",
};

const installHint: React.CSSProperties = { marginTop: 18 };
const installBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 12,
  background: "#0ea5e9",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 700,
};

const blurb: React.CSSProperties = {
  marginTop: 18,
  opacity: 0.85,
  lineHeight: 1.4,
};

const foot: React.CSSProperties = {
  marginTop: 22,
  opacity: 0.6,
  fontSize: 12,
};
