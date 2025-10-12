// src/app/_not-found/page.tsx
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main style={wrap}>
      <h1 style={{ margin: "8px 0 12px" }}>Page not found</h1>
      <p style={{ opacity: .8 }}>We couldn’t find that page.</p>
      <div style={{ marginTop: 12 }}>
        <Link href="/" style={btn}>Go home</Link>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, textDecoration:'none' };
