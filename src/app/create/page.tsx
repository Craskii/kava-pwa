'use client';
export const runtime = 'edge';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always persistent identity
  const me = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Host' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  async function handleCreate(type: 'list' | 'tournament') {
    if (!name.trim()) {
      alert('Please enter a name.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const body = { name, type, hostId: me.id };

      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());
      const game = await res.json();

      // ✅ Save host identity mapping (important!)
      localStorage.setItem('kava_me', JSON.stringify(me));
      localStorage.setItem('kava_hostId', game.hostId);
      localStorage.setItem('kava_lastGame', JSON.stringify(game));

      console.log('Created game:', game);

      if (game.type === 'list') router.push(`/list/${game.id}`);
      else router.push(`/t/${game.id}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to create game.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={wrap}>
      <BackButton href="/" />
      <h1 style={{ marginBottom: 10 }}>Create Game</h1>

      <input
        placeholder="Game name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={input}
        disabled={loading}
      />

      {error && <div style={errorBox}><b>Error:</b> {error}</div>}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button style={btn} onClick={() => handleCreate('list')} disabled={loading}>
          Create List
        </button>
        <button style={btnGhost} onClick={() => handleCreate('tournament')} disabled={loading}>
          Create Tournament
        </button>
      </div>

      <p style={{ opacity: 0.6, marginTop: 16 }}>me.id: {me.id}</p>
    </main>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0b0b0b', color: '#fff', padding: 24, fontFamily: 'system-ui' };
const input: React.CSSProperties = { width: '100%', maxWidth: 400, padding: '10px 12px', borderRadius: 10, border: '1px solid #333', background: '#111', color: '#fff', fontSize: 16, fontWeight: 500, marginBottom: 12 };
const btn: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid rgba(255,255,255,0.25)' };
const errorBox: React.CSSProperties = { background: '#3b0d0d', border: '1px solid #7f1d1d', borderRadius: 12, padding: 12, marginTop: 10 };
