// src/app/join/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import BackButton from '../components/BackButton';

type Me = { id: string; name: string };

function getMe(): Me {
  try {
    const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
    if (saved?.id && saved?.name) return saved;
  } catch {}
  const me = { id: crypto.randomUUID(), name: '' };
  localStorage.setItem('kava_me', JSON.stringify(me));
  return me;
}

export default function Join() {
  const r = useRouter();
  const sp = useSearchParams();
  const codeFromUrl = sp?.get('code')?.trim()?.toUpperCase() || '';

  const [me, setMe] = useState<Me>({ id: '', name: '' });
  const [code, setCode] = useState(codeFromUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setMe(getMe()); }, []);
  useEffect(() => {
    if (me.id) localStorage.setItem('kava_me', JSON.stringify(me));
  }, [me]);

  async function doJoin() {
    setErr(null);
    const cleanCode = (code || '').toUpperCase().replace(/\s+/g, '');
    const cleanName = (me.name || '').trim();
    if (!cleanName) { setErr('Please enter your name.'); return; }
    if (!/^[A-Z0-9]{5}$/.test(cleanCode)) { setErr('Please enter a valid 5-digit code.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ code: cleanCode, player: { id: me.id, name: cleanName } }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const data = await res.json(); // { id, status }
      r.replace(`/t/${data.id}`);
    } catch (e: any) {
      setErr(e?.message || 'Join failed.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !busy) doJoin();
  }

  return (
    <main style={wrap}>
      <div style={rowTop}><BackButton href="/" /></div>

      <section style={panel}>
        <h2 style={{ margin: '0 0 10px' }}>Join a tournament</h2>

        <input
          value={me.name}
          onChange={(e) => setMe((m) => ({ ...m, name: e.target.value }))}
          onKeyDown={onKeyDown}
          placeholder="Your name"
          style={input}
          disabled={busy}
        />

        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          placeholder="5-digit code"
          style={input}
          disabled={busy}
          inputMode="latin-prose"
          autoCapitalize="characters"
        />

        <button onClick={doJoin} disabled={busy} style={btnPrimary}>
          {busy ? 'Joining…' : 'Join'}
        </button>

        {err && <div style={errorBox}>{err}</div>}

        <Link href="/" style={homeLink}>Home</Link>
      </section>
    </main>
  );
}

/* ---------- styles (matches your old dark UI) ---------- */
const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0f15',
  color: '#fff',
  fontFamily: 'system-ui',
  padding: 16,
};
const rowTop: React.CSSProperties = { marginBottom: 10 };
const panel: React.CSSProperties = {
  maxWidth: 1000,
  margin: '0 auto',
  background: 'rgba(15, 20, 28, 0.9)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 12,
  padding: 12,
  display: 'grid',
  gap: 10,
};
const input: React.CSSProperties = {
  width: '100%',
  padding: '14px 12px',
  borderRadius: 10,
  border: '1px solid #2a2f36',
  background: '#151a21',
  color: '#fff',
  outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  width: 80,
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};
const errorBox: React.CSSProperties = {
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(255, 80, 80, .1)',
  border: '1px solid rgba(255, 80, 80, .35)',
  fontSize: 13,
};
const homeLink: React.CSSProperties = { color: '#60a5fa', width: 'fit-content' };
