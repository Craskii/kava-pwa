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

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return;

    // Dynamically load the SDK so OneSignal APIs exist even on first visit.
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.onesignal.com/sdks/OneSignalSDK.js"]',
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/OneSignalSDK.js';
      script.async = true;
      document.head.appendChild(script);
    }

    window.OneSignal = window.OneSignal || [];
    const OneSignal = window.OneSignal;

    OneSignal.push(function () {
      OneSignal.init({
        appId,
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
        // safari_web_id: '<OPTIONAL>',
      });

      // Ensure a subscription prompt is shown so push works when the PWA is backgrounded.
      if (OneSignal.Slidedown?.promptPush) {
        OneSignal.Slidedown.promptPush();
      } else if (OneSignal.registerForPushNotifications) {
        OneSignal.registerForPushNotifications();
      }

      // attach external user id = our player id (so we can target)
      try {
        const meRaw = localStorage.getItem('kava_me');
        const me = meRaw ? JSON.parse(meRaw) : null;
        if (me?.id) {
          OneSignal.setExternalUserId(me.id);
        }
      } catch {}
    });
  }, []);

  return null;
}
