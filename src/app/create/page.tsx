// src/app/create/page.tsx
'use client';
export const runtime = 'edge';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

type Me = { id: string; name: string };

export default function CreateGamePage() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = useMemo<Me>(() => {
    try {
      const existing = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (existing?.id) return existing;
    } catch {}
    const fresh = { id: uid(), name: 'Player' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  async function create(type: 'tournament' | 'list') {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-me': me.id, // <— ensure API gets a hostId
        },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const data = await res.json();
      const href: string = data?.href || (type === 'tournament' ? `/t/${data?.id}` : `/list/${data?.id}`);
      r.push(href);
    } catch (e: any) {
      setErr(e?.message || 'Failed to create');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={wrap}>
      <h1 style={{ margin: '8px 0 16px' }}>Create game</h1>

      {err && (
        <div style={errorBox}>
          <b>Couldn’t create</b>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{String(err)}</div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <button style={btn} disabled={busy} onClick={() => create('tournament')}>
          {busy ? 'Creating…' : 'Create a tournament'}
        </button>
        <button style={btnGhost} disabled={busy} onClick={() => create('list')}>
          {busy ? 'Creating…' : 'Create a list'}
        </button>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  padding: 24,
  fontFamily: 'system-ui',
};

const btn: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  background: 'rgba(239, 68, 68, .15)',
  border: '1px solid rgba(239, 68, 68, .4)',
  color: '#fecaca',
  padding: '10px 12px',
  borderRadius: 12,
  marginBottom: 12,
};
