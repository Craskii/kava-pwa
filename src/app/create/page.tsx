// src/app/create/page.tsx
'use client';
export const runtime = 'edge';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

type Me = { id: string; name: string };

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = useMemo<Me>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Host' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  async function handleCreate(type: 'list' | 'tournament') {
    if (!name.trim()) { alert('Please enter a name.'); return; }
    setLoading(true); setError(null);
    try {
      localStorage.setItem('kava_me', JSON.stringify(me));
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ name, type, hostId: me.id }),
      });
      const text = await res.text();
      if (!res.ok) {
        // Surface exact server error for easier debugging
        try { setError(JSON.parse(text)?.error || `HTTP ${res.status}`); }
        catch { setError(text || `HTTP ${res.status}`); }
        return;
      }
      const game = JSON.parse(text) as { id: string; type: 'list'|'tournament'; href?: string };
      const href = game.href || (game.type === 'list' ? `/list/${game.id}` : `/t/${game.id}`);
      localStorage.setItem('kava_lastGame', text);
      router.push(href);
    } catch (e:any) {
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

      {error && (
        <div style={errBox}>
          <b>Error:</b> <span style={{ opacity:.9 }}>{error}</span>
        </div>
      )}

      <div style={{ display:'flex', gap:12, marginTop:16 }}>
        <button style={btnPrimary} onClick={() => handleCreate('tournament')} disabled={loading}>
          {loading ? 'Creating…' : 'Create Tournament'}
        </button>
        <button style={btnGhost} onClick={() => handleCreate('list')} disabled={loading}>
          {loading ? 'Creating…' : 'Create List'}
        </button>
      </div>

      <p style={{ opacity:.6, marginTop:16, fontSize:12 }}>me.id: {me.id}</p>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = {
  minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui'
};
const input: React.CSSProperties = {
  width:'100%', maxWidth:420, padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff', fontSize:16, fontWeight:500, marginBottom:12
};
const btnPrimary: React.CSSProperties = {
  padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer'
};
const btnGhost: React.CSSProperties = {
  padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontWeight:700, cursor:'pointer'
};
const errBox: React.CSSProperties = {
  background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:12, padding:12, marginTop:8
};
