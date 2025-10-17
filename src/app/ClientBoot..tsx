// src/app/ClientBoot.tsx
'use client';

import { useEffect, useState } from 'react';

export default function ClientBoot({ children }: { children: React.ReactNode }) {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        // when a new SW is found
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // updated available
                setUpdateReady(true);
              }
            }
          });
        });

        // reload when controller changes (after we skipWaiting+claim)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      } catch (e) {
        // ignore
      }
    };

    register();
  }, []);

  return (
    <>
      {children}
      {updateReady && <UpdateToast onReload={() => {
        setUpdateReady(false);
        // tell waiting SW to skip waiting
        if (navigator.serviceWorker?.getRegistration) {
          navigator.serviceWorker.getRegistration().then(reg => {
            // @ts-ignore
            reg?.waiting?.postMessage?.({ type: 'SKIP_WAITING' });
          });
        }
      }}/>}
    </>
  );
}

function UpdateToast({ onReload }: { onReload: () => void }) {
  return (
    <div style={toastWrap}>
      <div style={toastCard}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Update ready</div>
        <div style={{ opacity: .85, marginBottom: 10 }}>A new version is available.</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onReload} style={toastBtn}>Reload now</button>
        </div>
      </div>
    </div>
  );
}

const toastWrap: React.CSSProperties = {
  position:'fixed', left:0, right:0, bottom:0, display:'grid', placeItems:'center', padding:'16px',
  pointerEvents:'none'
};
const toastCard: React.CSSProperties = {
  pointerEvents:'auto',
  background:'#111', color:'#fff', border:'1px solid rgba(255,255,255,.2)',
  borderRadius:12, padding:'12px 14px', width:'min(420px, 92vw)', boxShadow:'0 10px 32px rgba(0,0,0,.45)'
};
const toastBtn: React.CSSProperties = {
  padding:'8px 12px', borderRadius:8, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer'
};
