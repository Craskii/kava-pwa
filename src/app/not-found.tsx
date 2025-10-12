export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import React from 'react';

export default function NotFound() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Page not found</h1>
      <p style={p}>We could not find that page.</p>
      <div style={{ marginTop: 12 }}>
        <Link href="/" style={btn}>Go home</Link>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  padding: 24,
  fontFamily: 'system-ui',
};

const h1: React.CSSProperties = { margin: '8px 0 12px', fontSize: 24 };
const p: React.CSSProperties = { opacity: 0.8 };
const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
};
