// src/app/create/page.tsx
'use client';
export const runtime = 'edge';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current player identity (create one if missing)
  const me = useMemo(() => {
    try {
      const existing = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (existing?.id) return existing;
    } catch {}
    const newMe = { id: uid(), name: 'Host' };
    localStorage.setItem('kava_me', JSON.stringify(newMe));
    return newMe;
  }, []);

  // --- creation handlers ---
  async function handleCreate(type: 'list' | 'tournament') {
    if (!name.trim()) {
      alert('Please enter a name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          hostId: me.id, // ✅ make sure this matches the logged user
        }),
      });

      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const json = await res.json();
      if (json.type === 'list') router.push(`/list/${json.id}`);
      else router.push(`/t/${json.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create game.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={wrap}>
      <BackButton href="/" />
      <h1 style={{ marginBottom: 10 }}>Create Game</h1>

      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Enter a name, then choose whether this will be a <b>List</b> or a <b>Tournament</b>.
      </p>

      <input
        placeholder="Game name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={input}
        disabled={loading}
      />

      {error && (
        <div style={errorBox}>
          <b>Error:</b> {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button style={btn} onClick={() => handleCreate('list')} disabled={loading}>
          Create List
        </button>
        <button style={btnGhost} onClick={() => handleCreate('tournament')} disabled={loading}>
          Create Tournament
        </button>
      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  padding: 24,
  fontFamily: 'system-ui',
};

const input: React.CSSProperties = {
  width: '100%',
  maxWidth: 400,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#111',
  color: '#fff',
  fontSize: 16,
  fontWeight: 500,
  marginBottom: 12,
};

const btn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  ...btn,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.25)',
};

const errorBox: React.CSSProperties = {
  background: '#3b0d0d',
  border: '1px solid #7f1d1d',
  borderRadius: 12,
  padding: 12,
  marginTop: 10,
};
