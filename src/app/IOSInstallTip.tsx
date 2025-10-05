'use client';
import { useEffect, useState } from 'react';

function isStandalone(): boolean {
  const mm =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  const legacy =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mm || legacy);
}

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  // Matches popular in-app browsers (Instagram, Facebook, TikTok, etc.)
  return (
    /instagram|fbav|fban|fbios|fb_iab|messenger|tiktok|snapchat/.test(ua) &&
    !/safari/.test(ua)
  );
}

export default function IOSInstallTip() {
  const [showInstallTip, setShowInstallTip] = useState(false);
  const [showSafariTip, setShowSafariTip] = useState(false);
  const [openModal, setOpenModal] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    if (!isIOS) return;

    if (isInAppBrowser()) {
      setShowSafariTip(true);
    } else if (!isStandalone()) {
      setShowInstallTip(true);
    }
  }, []);

  // “Open in Safari” banner for in-app browsers
  if (showSafariTip) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          right: 16,
          background: '#111827',
          color: 'white',
          padding: '12px 14px',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          textAlign: 'center',
          fontSize: 14,
          zIndex: 50,
        }}
      >
        <strong>Open in Safari</strong> to install this app properly.
        <br />
        <button
          onClick={() => {
            const url = window.location.href.replace(/^https?:\/\//, '');
            window.location.href = `https://${url}`;
          }}
          style={{
            marginTop: 8,
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: '#0ea5e9',
            color: '#fff',
          }}
        >
          Open in Safari
        </button>
      </div>
    );
  }

  // “Add to Home Screen” prompt for Safari
  if (!showInstallTip) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          right: 16,
          background: '#111827',
          color: 'white',
          padding: '12px 14px',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 14,
          zIndex: 50,
        }}
      >
        <span>
          <strong>Install on iPhone:</strong> Tap Share → Add to Home Screen.
        </span>
        <button
          onClick={() => setOpenModal(true)}
          style={{
            marginLeft: 12,
            padding: '8px 10px',
            borderRadius: 10,
            border: 'none',
            background: '#0ea5e9',
            color: '#fff',
          }}
        >
          Show me
        </button>
      </div>

      {openModal && (
        <div
          onClick={() => setOpenModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              color: '#111',
              borderRadius: 14,
              padding: 16,
              width: 'min(420px, 92vw)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Add to Home Screen</h3>
            <ol style={{ lineHeight: 1.6, paddingLeft: 18 }}>
              <li>
                Tap the <span role="img" aria-label="share">🔗</span> <b>Share</b> button in Safari.
              </li>
              <li>
                Scroll down and choose <b>Add to Home Screen</b>.
              </li>
              <li>
                Tap <b>Add</b> — that’s it!
              </li>
            </ol>
            <button
              onClick={() => setOpenModal(false)}
              style={{
                marginTop: 8,
                padding: '10px 14px',
                border: 'none',
                borderRadius: 10,
                background: '#0ea5e9',
                color: '#fff',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
