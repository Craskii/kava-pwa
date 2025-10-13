'use client';

import { useEffect, useState } from 'react';
import { alertsEnabled, setAlertsEnabled } from '@/hooks/useQueueAlerts';

// Session-only "later" flag (resets when app relaunches)
const SS_LATER = 'kava_alerts_hint_later_session';

export default function LaunchReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      // If already enabled via toggle or permission, don't show
      const hasAPI = 'Notification' in window;
      const perm = hasAPI ? Notification.permission : 'granted'; // treat no-API as granted (we'll show in-app banners)
      const enabled = alertsEnabled() || perm === 'granted';
      const laterThisSession = sessionStorage.getItem(SS_LATER) === '1';

      if (!enabled && !laterThisSession) {
        setShow(true);
      }
    } catch {
      // If anything goes wrong, err on showing it
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div style={wrap}>
      <div style={{ fontWeight: 800, marginRight: 10 }}>
        Turn alerts ON to get “You’re up!” notifications
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={btnPrimary}
          onClick={async () => {
            try {
              if ('Notification' in window && Notification.permission !== 'granted') {
                // This may only prompt after a user gesture (this click counts)
                await Notification.requestPermission();
              }
              // Mark enabled if permission is granted OR Notification API is unavailable (we’ll use in-app banners)
              const ok = !('Notification' in window) || Notification.permission === 'granted';
              if (ok) setAlertsEnabled(true);
            } catch {}
            setShow(false);
          }}
        >
          Enable
        </button>
        <button
          style={btnGhost}
          onClick={() => {
            try { sessionStorage.setItem(SS_LATER, '1'); } catch {}
            setShow(false);
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  // sit above home indicator on iPhone
  bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  zIndex: 2147483647, // mega high
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  background: 'rgba(14,165,233,0.98)',
  color: '#000',
  padding: '12px 14px',
  borderRadius: 14,
  boxShadow: '0 12px 30px rgba(0,0,0,.45)',
  fontFamily: 'system-ui',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  background: '#111',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,.35)',
  background: 'transparent',
  color: '#000',
  fontWeight: 800,
  cursor: 'pointer',
};
