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
    if (!name.trim()) { alert('Please enter a name.'); return; }
    setLoading(true); setError(null);
    try {
      localStorage.setItem('kava_me', JSON.stringify(me));
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ name, type, hostId: me.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const game = await res.json(); // { id, code, hostId, type }
      localStorage.setItem('kava_lastGame', JSON.stringify(game));
      router.push(game.type === 'list' ? `/list/${game.id}` : `/t/${game.id}`);
    } catch (e:any) {
      setError(e?.message || 'Failed to create game.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' }}>
      <BackButton href="/" />
      <h1 style={{ marginBottom: 10 }}>Create Game</h1>
      <input
        placeholder="Game name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width:'100%', maxWidth:400, padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff', fontSize:16, fontWeight:500, marginBottom:12 }}
        disabled={loading}
      />
      {error && <div style={{ background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:12, padding:12, marginTop:10 }}><b>Error:</b> {error}</div>}
      <div style={{ display:'flex', gap:12, marginTop:16 }}>
        <button style={{ padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' }} onClick={() => handleCreate('list')} disabled={loading}>Create List</button>
        <button style={{ padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontWeight:700, cursor:'pointer' }} onClick={() => handleCreate('tournament')} disabled={loading}>Create Tournament</button>
      </div>
      <p style={{ opacity:.6, marginTop:16 }}>me.id: {me.id}</p>
    </main>
  );
}
