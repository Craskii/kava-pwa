// src/app/join/page.tsx
'use client';
export const runtime = 'edge';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinWithCode() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const c = code.replace(/\D+/g,'').slice(-5).padStart(5,'0');
    const nm = name.trim() || 'Player';
    if (!c) { setErr('Enter a 5-digit code'); return; }

    setBusy(true);
    try {
      // save my identity locally so the list UI shows my name (not "Player")
      const me = { id: (crypto as any).randomUUID?.() ?? `p_${Math.random().toString(36).slice(2)}`, name: nm };
      localStorage.setItem('kava_me', JSON.stringify(me));

      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: c, name: nm }),
      });

      if (!res.ok) {
        const txt = await res.text();
        try { setErr(JSON.parse(txt)?.error || 'Could not join. Check the code.'); }
        catch { setErr('Could not join. Check the code.'); }
        return;
        }

      const data = await res.json() as { href: string, me?: {id:string,name:string} };
      // prefer server-provided me (to match existing same-name user), then navigate
      if (data?.me) localStorage.setItem('kava_me', JSON.stringify(data.me));
      router.push(data.href || '/');

    } catch {
      setErr('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{minHeight:'100vh',background:'#0b0b0b',color:'#fff',padding:24,fontFamily:'system-ui'}}>
      <h1>Join with code</h1>
      <form onSubmit={onSubmit} style={{display:'grid',gap:8,maxWidth:360}}>
        <input
          placeholder="Your name"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          style={{padding:'10px 12px',borderRadius:10,border:'1px solid #333',background:'#111',color:'#fff'}}
        />
        <input
          placeholder="5-digit code"
          inputMode="numeric"
          pattern="[0-9]*"
          value={code}
          onChange={(e)=>setCode(e.target.value)}
          style={{padding:'10px 12px',borderRadius:10,border:'1px solid #333',background:'#111',color:'#fff',letterSpacing:2}}
        />
        <button disabled={busy} style={{padding:'10px 14px',borderRadius:10,border:'none',background:'#0ea5e9',color:'#fff',fontWeight:700,cursor:'pointer'}}>
          {busy ? 'Joining…' : 'Join'}
        </button>
        {err && <div style={{opacity:.85,color:'#f88'}}>{err}</div>}
      </form>
    </main>
  );
}
