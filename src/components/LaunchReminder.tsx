'use client';

import { useEffect, useState } from 'react';
import { alertsEnabled, setAlertsEnabled } from '@/hooks/useQueueAlerts';

const LS_LAST_HINT = 'kava_alerts_hint_last';

export default function LaunchReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (alertsEnabled()) return; // already on
      const last = Number(localStorage.getItem(LS_LAST_HINT) || 0);
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      if (!last || now - last > DAY) {
        setShow(true);
        localStorage.setItem(LS_LAST_HINT, String(now));
      }
    } catch {}
  }, []);

  if (!show) return null;

  return (
    <div style={wrap}>
      <div style={{fontWeight:700, marginRight:8}}>Remember to put alerts ON</div>
      <button
        style={btn}
        onClick={async () => {
          try {
            if ('Notification' in window && Notification.permission !== 'granted') {
              await Notification.requestPermission();
            }
            if (!('Notification' in window) || Notification.permission === 'granted') {
              setAlertsEnabled(true);
            }
          } catch {}
          setShow(false);
        }}
      >Enable</button>
      <button style={btnGhost} onClick={()=>setShow(false)}>Later</button>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position:'fixed', left:10, right:10, bottom:10, zIndex:999999,
  display:'flex', alignItems:'center', gap:10,
  background:'rgba(14,165,233,.95)', color:'#000',
  padding:'10px 12px', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,.35)',
  fontFamily:'system-ui'
};
const btn: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'none', background:'#111', color:'#fff', fontWeight:700 };
const btnGhost: React.CSSProperties = { padding:'8px 12px', borderRadius:10, border:'1px solid rgba(0,0,0,.35)', background:'transparent', color:'#000', fontWeight:700 };
