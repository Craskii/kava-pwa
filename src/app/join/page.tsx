// src/app/join/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BackButton from '../../components/BackButton';
import { uid } from '../../lib/storage';

export default function JoinPage() {
  const r = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function ensureMe(n: string) {
    let me = null as { id: string; name: string } | null;
    try { me = JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch {}
    if (!me) me = { id: uid(), name: n || 'Player' };
    else if (n && me.name !== n) me = { ...me, name: n };
    localStorage.setItem('kava_me', JSON.stringify(me));
    return me;
  }

  async function onJoin() {
    setErr(null);
    const n = name.trim() || 'Player';
    const c = code.replace(/[^0-9]/g, '').slice(0, 5);
    if (c.length !== 5) { setErr('Enter the 5-digit code.'); return; }
    setLoading(true);
    try {
      const me = ensureMe(n);
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: c, player: me }),
      });
      if (!res.ok) throw new Error(await res.text());
      // ✅ after joining, go to dashboard (/me)
      r.push('/me');
      r.refresh();
    } catch (e) {
      console.error(e);
      setErr('Could not join. Check the code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={wrap}>
      <div style={container}>
        <BackButton href="/" />
        <h1 style={h1}>Join a tournament</h1>

        <div style={{ display: 'grid', gap: 10 }}>
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" style={input} />
          <input
            value={code}
            onChange={(e)=>setCode(e.target.value.replace(/[^0-9]/g, '').slice(0,5))}
            placeholder="5-digit code"
            inputMode="numeric"
            style={input}
          />
          <button onClick={onJoin} disabled={loading} style={btnPrimary}>
            {loading ? 'Joining…' : 'Join'}
          </button>
          {err && <p style={errP}>{err}</p>}
        </div>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b1220', color:'#fff', padding:16 };
const container: React.CSSProperties = { width:'100%', maxWidth:560, margin:'0 auto', display:'grid', gap:16 };
const h1: React.CSSProperties = { fontSize:24, fontWeight:700, margin:'4px 0 8px' };
const input: React.CSSProperties = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const btnPrimary: React.CSSProperties = { padding:'12px 16px', borderRadius:12, background:'#0ea5e9', border:'none', color:'#fff', fontWeight:700, cursor:'pointer' };
const errP: React.CSSProperties = { color:'#fca5a5', marginTop:4, fontSize:14 };
