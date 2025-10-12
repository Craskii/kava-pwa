// src/app/join/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type ByCodeResult =
  | { type: 'list'; id: string }
  | { type: 'tournament'; id: string }
  | { error: string };

export default function JoinPage(props: { searchParams?: { code?: string } }) {
  const code = (props?.searchParams?.code || '').trim();
  const [msg, setMsg] = useState('Joining…');

  useEffect(() => {
    let alive = true;

    async function go() {
      if (!code) {
        setMsg('Missing code.');
        return;
      }
      try {
        const r = await fetch(`/api/by-code/${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const data = (await r.json()) as ByCodeResult;
        if (!alive) return;

        if ('error' in data) {
          setMsg(data.error || 'Invalid code.');
          return;
        }
        if (data.type === 'list') {
          window.location.replace(`/list/${encodeURIComponent(data.id)}`);
        } else {
          window.location.replace(`/t/${encodeURIComponent(data.id)}`);
        }
      } catch {
        if (alive) setMsg('Could not join. Check your link or try again.');
      }
    }

    go();
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={{ margin: '6px 0 10px' }}>{msg}</h1>
        <p>If nothing happens, check your link or go back.</p>
        <Link href="/" style={{ color: '#60a5fa' }}>Home</Link>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  fontFamily: 'system-ui',
  padding: 24,
};
const card: React.CSSProperties = {
  maxWidth: 640,
  margin: '0 auto',
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 14,
  padding: 16,
};
