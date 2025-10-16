'use client';
import { useEffect } from 'react';

/** Prevent the platform overlay from replacing the UI; still logs stacks to console */
export default function ClientErrorTrap() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      console.error('Global error:', e.error ?? e.message);
      e.preventDefault();
    };
    const onRej = (e: PromiseRejectionEvent) => {
      console.error('Unhandled rejection:', e.reason);
      e.preventDefault();
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
  return null;
}
