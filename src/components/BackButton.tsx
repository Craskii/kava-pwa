'use client';

import Link from 'next/link';

export default function BackButton({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: '#fff',
        textDecoration: 'none',
        width: 'fit-content',
        marginBottom: 12,       // <-- inline, no fixed/overlay
      }}
    >
      ← Back
    </Link>
  );
}
