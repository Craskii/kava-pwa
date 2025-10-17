// src/app/OneSignalBoot.tsx
'use client';
import { useEffect } from 'react';

declare global {
  interface Window {
    OneSignal?: any;
  }
}

export default function OneSignalBoot() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.OneSignal = window.OneSignal || [];
    const OneSignal = window.OneSignal;

    OneSignal.push(function () {
      OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID, // set this in CF env
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
        // safari_web_id: '<OPTIONAL>',
      });
    });

    // attach external user id = our player id (so we can target)
    try {
      const meRaw = localStorage.getItem('kava_me');
      const me = meRaw ? JSON.parse(meRaw) : null;
      if (me?.id) {
        OneSignal.push(function () {
          OneSignal.setExternalUserId(me.id);
        });
      }
    } catch {}

  }, []);

  return null;
}
