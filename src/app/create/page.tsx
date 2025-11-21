// src/app/create/page.tsx
'use client';
export const runtime = 'edge';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

type TournamentFormat = 'singles' | 'doubles' | 'groups' | 'single_elim';

type Me = { id: string; name: string };

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('single_elim');
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

      const settings = type === 'tournament'
        ? {
            format,
            teamSize: format === 'doubles' ? 2 : 1,
            bracketStyle: 'single_elim' as const,
            groups: format === 'groups' ? { count: 4, size: 4 } : undefined,
          }
        : undefined;
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ name, type, hostId: me.id, settings }),
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

      <div style={{ marginBottom: 10 }}>
        <h3 style={{ margin: '6px 0' }}>Tournament format</h3>
        <div style={{ display:'grid', gap:8 }}>
          {[
            { key: 'single_elim', label: 'Standard bracket (single elimination)', desc: '1v1 bracket — classic knock-out.', teamSize: 1 },
            { key: 'singles', label: 'Singles (1v1 flexible)', desc: 'Supports reseeding or mixed-stage tweaks.', teamSize: 1 },
            { key: 'doubles', label: 'Doubles (2v2)', desc: 'Auto-pairs players into two-person teams.', teamSize: 2 },
            { key: 'groups', label: 'Groups / Pools', desc: 'Group stage with downstream bracket seeding.', teamSize: 1 },
          ].map(opt => (
            <label key={opt.key} style={{
              border:'1px solid rgba(255,255,255,0.2)',
              borderRadius:12,
              padding:'10px 12px',
              display:'grid',
              gap:4,
              background: format === opt.key ? 'rgba(14,165,233,0.16)' : 'rgba(255,255,255,0.04)'
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <div style={{ display:'grid', gap:2 }}>
                  <span style={{ fontWeight:700 }}>{opt.label}</span>
                  <span style={{ opacity:.7, fontSize:12 }}>{opt.desc}</span>
                </div>
                <input
                  type="radio"
                  name="format"
                  value={opt.key}
                  checked={format === opt.key}
                  onChange={() => setFormat(opt.key as TournamentFormat)}
                  disabled={loading}
                  style={{ width:18, height:18 }}
                />
              </div>
              <div style={{ fontSize:12, opacity:.8 }}>Team size: {opt.teamSize}</div>
            </label>
          ))}
        </div>
      </div>

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
