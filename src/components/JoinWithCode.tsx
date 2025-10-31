// src/components/JoinWithCode.tsx
'use client';

import { useMemo, useState } from 'react';
import { uid } from '@/lib/storage';

export default function JoinWithCode() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: 'Player' };
    localStorage.setItem('kava_me', JSON.stringify(fresh));
    return fresh;
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr(null);
    const digits = code.replace(/\D+/g, '').slice(-5).padStart(5, '0');
    if (!digits) { setErr('Enter a 5-digit code'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: digits,
          userId: me.id,           // ✅ critical to index the right player
          name: name.trim() || me.name || 'Player'
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      if (j?.href) location.href = j.href;
    } catch (e:any) {
      setErr('Could not join. ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{display:'grid',gap:8}}>
      <div style={{display:'grid',gap:6}}>
        <label htmlFor="join-code" style={{opacity:.8}}>Private code</label>
        <input
          id="join-code"
          name="joinCode"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          placeholder="12345"
          value={code}
          onChange={(e)=>setCode(e.currentTarget.value)}
          style={inp}
        />
      </div>
      <div style={{display:'grid',gap:6}}>
        <label htmlFor="join-name" style={{opacity:.8}}>Your name</label>
        <input
          id="join-name"
          name="playerName"
          autoComplete="name"
          placeholder={me.name || 'Player'}
          value={name}
          onChange={(e)=>setName(e.currentTarget.value)}
          style={inp}
        />
      </div>
      <button disabled={busy} style={btn}>{busy?'Joining…':'Join'}</button>
      {err && <div style={{color:'#f88',fontSize:13}}>{err}</div>}
    </form>
  );
}

const inp: React.CSSProperties = { padding:'10px 12px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'none', background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer' };
