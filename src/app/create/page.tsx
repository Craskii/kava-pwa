'use client';
export const runtime = 'edge';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BackButton from '../../components/BackButton';
import { uid } from '../../lib/storage';

type GameType = 'tournament' | 'list';

export default function CreateGamePage() {
  const r = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<GameType | ''>('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function ensureMe(n?: string) {
    let me: { id: string; name: string } | null = null;
    try { me = JSON.parse(localStorage.getItem('kava_me') || 'null'); } catch {}
    if (!me) me = { id: uid(), name: n || 'Host' };
    if (n && me.name !== n) me = { ...me, name: n };
    localStorage.setItem('kava_me', JSON.stringify(me));
    return me;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const nm = name.trim();
    if (!nm || !type) { setErr('Enter a name and pick List or Tournament.'); return; }

    const me = ensureMe();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nm, type, hostId: me.id }), // include hostId
      });
      if (!res.ok) throw new Error(await res.text());

      // After creating, send home (your preference earlier)
      r.push('/');
      r.refresh();
    } catch (e: any) {
      setErr(e?.message || 'Could not create.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={wrap}>
      <div style={container}>
        <BackButton href="/" />
        <h1 style={h1}>Create game</h1>

        <form onSubmit={onCreate} style={{ display:'grid', gap:12 }}>
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Game name" style={input} />

          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button type="button" onClick={()=>setType('list')} style={type==='list'?btnPrimary:btnOutline}>List</button>
            <button type="button" onClick={()=>setType('tournament')} style={type==='tournament'?btnPrimary:btnOutline}>Tournament</button>
          </div>

          {err && <p style={errP}>{err}</p>}
          <button type="submit" disabled={loading} style={btnPrimary}>{loading ? 'Creating…' : 'Create'}</button>
        </form>
      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b1220', color:'#fff', padding:16 };
const container: React.CSSProperties = { width:'100%', maxWidth:560, margin:'0 auto', display:'grid', gap:16 };
const h1: React.CSSProperties = { fontSize:24, fontWeight:700, margin:'4px 0 8px' };
const input: React.CSSProperties = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const btnPrimary: React.CSSProperties = { padding:'12px 16px', borderRadius:12, background:'#0ea5e9', border:'none', color:'#fff', fontWeight:700, cursor:'pointer' };
const btnOutline: React.CSSProperties = { padding:'12px 16px', borderRadius:12, background:'transparent', border:'1px solid rgba(255,255,255,.25)', color:'#fff', fontWeight:700, cursor:'pointer' };
const errP: React.CSSProperties = { color:'#fca5a5', marginTop:4, fontSize:14 };
