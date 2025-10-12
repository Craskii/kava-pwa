// src/app/tournaments/page.tsx
'use client';
export const runtime = 'edge';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';

type Tournament = {
  id: string;
  name: string;
  status?: string;
  players?: { id: string; name: string }[];
  createdAt?: number;
  updatedAt?: number;
};

type ListsResp = {
  hosting: Tournament[];
  playing: Tournament[];
  listVersion: number;
  error?: string;
};

function getMe() {
  try {
    const m = JSON.parse(localStorage.getItem('kava_me') || 'null');
    if (m?.id) return m;
  } catch {}
  const m = { id: crypto.randomUUID(), name: '' };
  localStorage.setItem('kava_me', JSON.stringify(m));
  return m;
}

export default function Tournaments() {
  const [data, setData] = useState<ListsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const me = useMemo(getMe, []);

  useEffect(() => {
    let gone = false;
    const load = async () => {
      setErr(null);
      try {
        const res = await fetch(`/api/tournaments?userId=${encodeURIComponent(me.id)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!gone) setData(json as ListsResp);
      } catch (e: any) {
        if (!gone) setErr(`Couldn’t load tournaments. ${e?.message || e}`);
      }
    };
    load();
    const id = setInterval(load, 8000); // light auto-refresh
    return () => { gone = true; clearInterval(id); };
  }, [me.id]);

  return (
    <main style={wrap}>
      <div style={container}>
        <div style={{ marginBottom: 10 }}>
          <BackButton href="/" />
        </div>

        <h2 style={h2}>My tournaments</h2>

        {err && <div style={errorBox}>{err}</div>}

        {!data && !err && <div style={{ opacity:.8 }}>Loading…</div>}

        {data && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Section title="Hosting" items={data.hosting} empty="You’re not hosting any tournaments yet." />
            <Section title="Playing" items={data.playing} empty="You’re not a player in any tournaments yet." />
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, items, empty }: { title: string; items: Tournament[]; empty: string }) {
  return (
    <section style={card}>
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      {items.length === 0 ? (
        <div style={{ opacity: .7, fontSize: 13 }}>{empty}</div>
      ) : (
        <ul style={list}>
          {items.map(t => (
            <li key={t.id} style={row}>
              <div>
                <div style={{ fontWeight: 700 }}>{t.name}</div>
                <div style={{ opacity: .7, fontSize: 12 }}>
                  {t.players?.length ?? 0} {((t.players?.length ?? 0) === 1) ? 'player' : 'players'} • {t.status || 'setup'}
                </div>
              </div>
              <Link href={`/t/${t.id}`} style={openBtn}>Open</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0b0b0b', color: '#fff', fontFamily: 'system-ui', padding: 16 };
const container: React.CSSProperties = { maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 12 };
const h2: React.CSSProperties = { margin: '4px 0 10px', fontSize: 22 };
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 14 };
const list: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderRadius: 10, padding: '10px 12px' };
const openBtn: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, background: '#0ea5e9', color: '#fff', textDecoration: 'none', fontWeight: 800 };
const errorBox: React.CSSProperties = { padding:'10px 12px', borderRadius:10, background:'rgba(255,80,80,.1)', border:'1px solid rgba(255,80,80,.35)' };
