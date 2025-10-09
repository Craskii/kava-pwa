// src/components/BackButton.tsx
'use client';

import Link from 'next/link';
import React from 'react';

type Props = {
  href?: string;
  label?: string;
  className?: string;
};

/**
 * Inline Back button (NOT fixed).
 * It won’t overlap your headers/inputs.
 */
export default function BackButton({ href = '/', label = 'Back', className = '' }: Props) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm ' +
        'hover:bg-white/5 ' +
        className
      }
    >
      ← {label}
    </Link>
  );
}
