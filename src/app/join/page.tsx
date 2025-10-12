// src/app/join/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type ResolveResult = { type: 'list' | 'tournament'; id: string };

async function resolveCode(code: string): Promise<ResolveResult | null> {
  const res = await fetch(`/api/by-code/${encodeURIComponent(code)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default function JoinPage() {
  const r = useRouter();
  const sp = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const triedAuto = useRef(false);

  // Auto-join if ?code=XXXXX is present
  useEffect(() => {
    const c = sp?.get('code')?.trim();
    if (!c || triedAuto.current) return;
    triedAuto.current = true;
    (async () => {
      setBusy(true);
      setMsg('Joining…');
      const res = await resolveCode(c);
      if (!res) {
        setBusy(false);
        setMsg('Invalid or expired code.');
        return;
      }
      if (res.type === 'list') r.replace(`/list/${encodeURIComponent(res.id)}`);
      else r.replace(`/t/${encodeURIComponent(res.id)}`);
    })();
  }, [sp, r]);

  async function onJoin() {
    const c = code.trim();
    if (!c) { setMsg('Please enter a code.'); return; }
    setBusy(true);
    setMsg('Checking code…');
    const res = await resolveCode(c);
    if (!res) { setBusy(false); setMsg('Invalid or expired code.'); return; }
    if (res.type === 'list') r.push(`/list/${encodeURIComponent(res.id)}`);
    else r.push(`/t/${encodeURIComponent(res.id)}`);
  }

  return (
    <main style={wrap}>
      <div style={container}>
        <h1 style={h1}>Join with code</h1>

        <div style={card}>
          <input
            placeholder="Enter 5-digit code"
            inputMode="numeric"
            pattern="[0-9]*"
            value={code}
            onChange={e=>setCode(e.target.value)}
            disabled={busy}
            style={input}
          />
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button onClick={onJoin} disabled={busy} style={btnPrimary}>{busy ? 'Joining…' : 'Join'}</button>
            <Link href="/" style={btn}>Home</Link>
          </div>
          {msg && <div style={{opacity:.85,marginTop:10}}>{msg}</div>}
          <div style={{opacity:.7, fontSize:13, marginTop:6}}>
            Tip: If you opened a link and nothing happened, paste the code here.
          </div>
        </div>

      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', fontFamily:'system-ui', padding:24 };
const container: React.CSSProperties = { maxWidth:700, margin:'0 auto', display:'grid', gap:14 };
const h1: React.CSSProperties = { margin:'8px 0 4px', fontSize:24 };
const card: React.CSSProperties = { background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:14 };
const input: React.CSSProperties = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid #333', background:'#111', color:'#fff' };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', textDecoration:'none', fontWeight:700 };
const btnPrimary: React.CSSProperties = { ...btn, border:'none', background:'#0ea5e9' };
