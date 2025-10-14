// src/app/sw-register.tsx
'use client';
import { useEffect } from 'react';

const SW_URL = '/sw.js';
const SW_VERSION = 'v7'; // bump when shipping alerts changes

export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register(`${SW_URL}?v=${SW_VERSION}`)
      .then(reg => {
        if (reg.waiting) reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
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
      // new SW is active
    });
  }, []);

  return null;
}
