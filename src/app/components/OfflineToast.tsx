'use client';
import { useEffect, useState } from 'react';

export default function OfflineToast() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const go = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', go);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', go);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16,
      background: '#ef4444', color: 'white', padding: '10px 12px',
      borderRadius: 12, textAlign: 'center', zIndex: 60
    }}>
      You’re offline. Some actions may be unavailable.
    </div>
  );
}
