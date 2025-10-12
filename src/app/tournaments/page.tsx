// src/app/tournaments/page.tsx
'use client';
export const runtime = 'edge';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton';

type TournamentRow = { id: string; name: string; status?: string; players?: any[] };

export default function MyTournamentsPage() {
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch('/api/tournaments', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!stop) setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!stop) setErr('Could not load tournaments.');
        console.error(e);
      }
    })();
    return () => { stop = true; };
  }, []);

  return (
    <main style={wrap}>
      <div style={container}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <BackButton href="/" />
          <Link href="/create" style={btnPrimary}>+ Create game</Link>
        </div>

        <h1 style={h1}>My tournaments</h1>

        {err && <div style={notice}>{err}</div>}

        {rows === null ? (
          <div>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={empty}>No tournaments yet. Create one to get started.</div>
        ) : (
          <ul style={list}>
            {rows.map(t => (
              <li key={t.id} style={row}>
                <div>
                  <div style={{fontWeight:700}}>{t.name || 'Untitled tournament'}</div>
                  <div style={{opacity:.75,fontSize:13}}>
                    {t.status || 'setup'}{typeof t.players?.length === 'number' ? ` • ${t.players.length} players` : ''}
                  </div>
                </div>
                <Link href={`/t/${encodeURIComponent(t.id)}`} style={btn}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/* styles (match your app style) */
const wrap: React.CSSProperties = { minHeight:'100vh', background:'#0b0b0b', color:'#fff', fontFamily:'system-ui', padding:24 };
const container: React.CSSProperties = { maxWidth:900, margin:'0 auto', display:'grid', gap:14 };
const h1: React.CSSProperties = { margin:'8px 0 4px', fontSize:24 };
const notice: React.CSSProperties = { background:'rgba(14,165,233,.12)', border:'1px solid rgba(14,165,233,.25)', borderRadius:12, padding:'10px 12px' };
const empty: React.CSSProperties = { opacity:.8 };
const list: React.CSSProperties = { listStyle:'none', padding:0, margin:0, display:'grid', gap:10 };
const row: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 14px' };
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', cursor:'pointer', textDecoration:'none', fontWeight:700 };
const btnPrimary: React.CSSProperties = { ...btn, border:'none', background:'#0ea5e9' };
