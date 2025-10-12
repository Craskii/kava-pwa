// src/app/page.tsx
export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // avoid prerender crashes if you read request-time info

import Link from "next/link";

type HomeSearch = {
  listId?: string;
  tournamentId?: string;
  [k: string]: string | undefined;
};

export default function HomePage({
  searchParams,
}: {
  searchParams?: HomeSearch; // <<< make optional
}) {
  const listId = searchParams?.listId ?? "";
  const tournamentId = searchParams?.tournamentId ?? "";

  return (
    <main style={wrap}>
      <h1 style={{ margin: "8px 0 12px" }}>Kava</h1>

      <div style={card}>
        <p style={{ margin: 0, opacity: .85 }}>
          Welcome! This page renders safely even when <code>searchParams</code> is undefined.
          {listId && <> &nbsp;listId=<code>{listId}</code></>}
          {tournamentId && <> &nbsp;tournamentId=<code>{tournamentId}</code></>}
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Link href="/lists" style={btn}>My lists</Link>
          <Link href="/me" style={btnGhost}>My tournaments</Link>
          <Link href="/nearby" style={btnGhost}>Nearby</Link>
        </div>
      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const card: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginTop:12 };
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none' };
const btnGhost: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', textDecoration:'none' };
