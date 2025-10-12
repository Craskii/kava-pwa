// src/app/components/BackButton.tsx
'use client';
import Link from 'next/link';

export default function BackButton({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} style={{
      display: 'inline-block',
      padding: '8px 12px',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,.2)',
      color: '#fff',
      textDecoration: 'none',
      background: 'transparent'
    }}>
      ← Back
    </Link>
  );
}
