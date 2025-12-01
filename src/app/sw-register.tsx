'use client';
import { useEffect } from 'react';

const SW_URL = '/sw.js';
const SW_VERSION = 'v9'; // bump when you change alerts/SW

export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const desiredUrl = new URL(`${SW_URL}?v=${SW_VERSION}`, location.origin).toString();

    // Unregister any other SWs (e.g., old Workbox)
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        const url = (reg as any)?.active?.scriptURL || reg?.scope;
        if (url && !url.startsWith(desiredUrl) && !url.endsWith('/sw.js') && !url.includes('v=' + SW_VERSION)) {
          reg.unregister().catch(() => {});
        }
      });
    });

    navigator.serviceWorker
      .register(desiredUrl)
      .then((reg) => {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // new SW active
    });
  }, []);

  return null;
}
