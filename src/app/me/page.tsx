// src/app/me/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import { getOrCreateMe } from '@/lib/me';

type TItem = {
  id: string;
  name: string;
  code?: string;
  createdAt?: number;
  hostId: string;
};

type ApiResp = { hosting: TItem[]; playing: TItem[] };

export default function MyTournamentsPage() {
  const me = useMemo(() => getOrCreateMe('Player'), []);
  const [data, setData] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/tournaments?userId=${encodeURIComponent(me.id)}`, {
        cache: 'no-store',
        headers: { 'x-user-id': me.id }, // header fallback too
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}\n${txt || 'Failed to load'}`);
      }
      const json = (await res.json()) as ApiResp;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <main style={wrap}>
        <div style={head}>
          <BackButton href="/" />
          <h1 style={{ margin: 0 }}>My tournaments</h1>
        </div>
        <p style={{ opacity: .7 }}>Loading…</p>
      </main>
    );
  }

  if (err) {
    return (
      <main style={wrap}>
        <div style={head}>
          <BackButton href="/" />
          <h1 style={{ margin: 0 }}>My tournaments</h1>
        </div>
        <div style={errorBox}>
          <b>Couldn’t load tournaments</b>
          <pre style={pre}>{err}</pre>
          <div style={{ marginTop: 8 }}>
            <button style={btn} onClick={load}>Try again</button>
            <a href="/api/tournaments" style={{ marginLeft: 12, color: '#9CDCFE' }}>Open API</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={head}>
        <BackButton href="/" />
        <h1 style={{ margin: 0 }}>My tournaments</h1>
      </div>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Hosting ({data?.hosting.length || 0})</h3>
        {(data?.hosting.length || 0) === 0 ? (
          <div style={{ opacity: .7 }}>You aren’t hosting any tournaments yet.</div>
        ) : (
          <ul style={list}>
            {data!.hosting.map(t => (
              <li key={t.id} style={row}>
                <div>
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  {t.code && <div style={{ opacity: .7, fontSize: 12 }}>Code: {t.code}</div>}
                </div>
                <Link href={`/t/${t.id}`} style={linkBtn}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Playing ({data?.playing.length || 0})</h3>
        {(data?.playing.length || 0) === 0 ? (
          <div style={{ opacity: .7 }}>You aren’t in any tournaments yet.</div>
        ) : (
          <ul style={list}>
            {data!.playing.map(t => (
              <li key={t.id} style={row}>
                <div>
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  {t.code && <div style={{ opacity: .7, fontSize: 12 }}>Code: {t.code}</div>}
                </div>
                <Link href={`/t/${t.id}`} style={linkBtn}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0b0b0b', color: '#fff', padding: 24, fontFamily: 'system-ui' };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 };
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 14, marginBottom: 14 };
const list: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111', borderRadius: 10, padding: '10px 12px' };
const linkBtn: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, background: '#0ea5e9', color: '#fff', textDecoration: 'none', fontWeight: 700 };
const btn: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const errorBox: React.CSSProperties = { background: 'rgba(127,29,29,.2)', border: '1px solid rgba(127,29,29,.5)', padding: 12, borderRadius: 12 };
const pre: React.CSSProperties = { whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6 };
