'use client';

import React, { useEffect, useState } from 'react';
import { registerSW } from '@/lib/register-sw';

type Props = { children: React.ReactNode };

export default function ClientBoot({ children }: Props) {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    // Only try to register in browsers that support SW
    if ('serviceWorker' in navigator) {
      const unregister = registerSW({
        onUpdated: () => setUpdateReady(true),
        onRegistered: () => {/* no-op */},
        scope: '/',
      });
      return unregister;
    }
  }, []);

  return (
    <>
      {/* simple in-app toast when a new SW is waiting */}
      {updateReady && (
        <div style={toastWrap}>
          <div style={toastCard}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Update available</div>
            <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 8 }}>
              A new version is ready. Reload to update instantly.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={btnPrimary}
                onClick={() => {
                  // Tell the waiting SW to take control, then reload.
                  navigator.serviceWorker.getRegistration().then((reg) => {
                    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
                    // Small delay to let it activate
                    setTimeout(() => window.location.reload(), 150);
                  });
                }}
              >
                Reload now
              </button>
              <button
                style={btnGhost}
                onClick={() => setUpdateReady(false)}
                title="I'll reload later"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {children}
    </>
  );
}

/* --- tiny inline styles --- */
const toastWrap: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 16,
  display: 'grid',
  placeItems: 'center',
  zIndex: 9999,
  pointerEvents: 'none',
};
const toastCard: React.CSSProperties = {
  pointerEvents: 'auto',
  background: 'rgba(17,17,17,0.95)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 12,
  padding: '12px 14px',
  width: 'min(420px, 92vw)',
  boxShadow: '0 8px 24px rgba(0,0,0,.4)',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
};
