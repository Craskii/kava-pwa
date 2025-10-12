// src/app/nearby/page.tsx
export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // don't prerender; avoid build-time destructuring crash

import Link from "next/link";

type NearbySearch = {
  listId?: string;
  tournamentId?: string;
  [k: string]: string | undefined;
};

export default function NearbyPage({
  searchParams,
}: {
  searchParams?: NearbySearch; // <— make optional
}) {
  const listId = searchParams?.listId ?? "";
  const tournamentId = searchParams?.tournamentId ?? "";

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href="/" style={btnGhost}>← Back</Link>
        <span style={pill}>Live</span>
      </div>

      <h1 style={{ margin: "12px 0" }}>Nearby</h1>

      <div style={card}>
        <p style={{ margin: 0, opacity: .85 }}>
          This page loads dynamically so it won’t break during prerendering.
          {Boolean(listId) && <> You opened it with <b>listId</b>: <code>{listId}</code>.</>}
          {Boolean(tournamentId) && <> You opened it with <b>tournamentId</b>: <code>{tournamentId}</code>.</>}
        </p>
      </div>
    </main>
  );
}

/* lightweight styles (same visual language) */
const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0b", color: "#fff", padding: 24, fontFamily: "system-ui" };
const card: React.CSSProperties = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 14, marginTop: 12 };
const pill: React.CSSProperties = { padding: "6px 10px", borderRadius: 999, background: "rgba(16,185,129,.2)", border: "1px solid rgba(16,185,129,.35)", fontSize: 12 };
const btnGhost: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", textDecoration: "none" };
