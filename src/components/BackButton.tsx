// src/components/BackButton.tsx
'use client';

import Link from 'next/link';

type Props = { href?: string; label?: string; className?: string };

/**
 * Inline Back button that **cannot** overlap content.
 * Uses position: static and resets any global fixed styles.
 */
export default function BackButton({ href = '/', label = 'Back', className = '' }: Props) {
  return (
    <Link
      href={href}
      style={{
        // hard reset in case globals had fixed/absolute
        position: 'static',
        inset: 'auto',
        zIndex: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.15)',
        background: 'transparent',
        color: '#fff',
        textDecoration: 'none',
        touchAction: 'manipulation',
      }}
      className={className}
    >
      ← {label}
    </Link>
  );
}
