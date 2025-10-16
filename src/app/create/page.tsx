// src/app/create/page.tsx
'use client';
export const runtime = 'edge';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { uid } from '@/lib/storage';

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // persistent identity
  const me = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Host' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  async function create(type: 'list' | 'tournament') {
    if (!name.trim()) { alert('Please enter a name.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, type, hostId: me.id }),
      });
      if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`));
      const game = await res.json();

      // save identity + last game + hostId
      localStorage.setItem('kava_me', JSON.stringify(me));
      if (game.hostId) localStorage.setItem('kava_hostId', game.hostId);
      localStorage.setItem('kava_lastGame', JSON.stringify(game));

      router.push(game.type === 'list' ? `/list/${game.id}` : `/t/${game.id}`);
    } catch (e:any) {
      setErr(e?.message || 'Failed to create game.');
    } finally { setBusy(false); }
  }

  return (
    <main style={wrap}>
      <BackButton href="/" />
      <h1 style={{ marginBottom: 10 }}>Create Game</h1>

      <input
        placeholder="Game name…"
        value={name}
        onChange={(e)=>setName(e.target.value)}
        style={input}
        disabled={busy}
      />

      {err && <div style={errorBox}><b>Error:</b> {err}</div>}

      <div style={{ display:'flex', gap:12, marginTop:12 }}>
        <button style={btn} onClick={()=>create('list')} disabled={busy}>Create List</button>
        <button style={btnGhost} onClick={()=>create('tournament')} disabled={busy}>Create Tournament</button>
      </div>

      <div style={{ opacity:.6, marginTop:12, fontSize:12 }}>me.id: {me.id}</div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' };
const input: React.CSSProperties = { width:'100%', maxWidth:420, padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff', fontSize:16, marginBottom:10 };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnGhost: React.CSSProperties = { ...btn, background:'transparent', border:'1px solid rgba(255,255,255,.25)' };
const errorBox: React.CSSProperties = { background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:12, padding:12, marginTop:10 };
