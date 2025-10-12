// src/app/tournaments/page.tsx
'use client';
export const runtime = 'edge';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/BackButton';

/** Minimal types that match your API shape */
type Player = { id: string; name: string };
type TournamentRow = {
  id: string;
  name: string;
  hostId: string;
  status?: 'setup' | 'active' | 'completed';
  players?: Player[];
  code?: string | null;
};

export default function MyTournaments() {
  const me = useMemo<Player>(() => {
    try {
      return JSON.parse(localStorage.getItem('kava_me') || 'null') || {
        id: crypto.randomUUID(),
        name: 'Player',
      };
    } catch {
      return { id: crypto.randomUUID(), name: 'Player' };
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('kava_me', JSON.stringify(me));
  }, [me]);

  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/tournaments', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TournamentRow[];
        if (alive) setRows(data);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hosting = (rows || []).filter((t) => t.hostId === me.id);
  const playing = (rows || []).filter(
    (t) => t.hostId !== me.id && (t.players || []).some((p) => p.id === me.id)
  );

  return (
    <main style={wrap}>
      <div style={container}>
        <BackButton href="/" />
        <h1 style={h1}>My tournaments</h1>

        {error && (
          <div style={errorBox}>
            Couldn’t load tournaments. <span style={{ opacity: 0.8 }}>{error}</span>
          </div>
        )}

        {/* Hosting */}
        <section style={card}>
          <div style={rowHead}>
            <b>Hosting</b>
            <span style={hint}>Live</span>
          </div>
          {hosting.length === 0 ? (
            <div style={muted}>You’re not hosting any tournaments yet.</div>
          ) : (
            <ul style={list}>
              {hosting.map((t) => (
                <li key={t.id} style={row}>
                  <div>
                    <div style={titleLine}>
                      <span>{t.name}</span>
                      {t.status === 'active' && <span style={livePill}>Live</span>}
                      {t.status === 'completed' && <span style={donePill}>Done</span>}
                    </div>
                    <div style={sub}>
                      {t.players?.length ?? 0} players •{' '}
                      {t.code ? (
                        <>
                          Private code: <b>{t.code}</b>
                        </>
                      ) : (
                        'Public'
                      )}
                    </div>
                  </div>
                  <Link href={`/t/${t.id}`} style={goBtn} prefetch>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Playing */}
        <section style={card}>
          <div style={rowHead}>
            <b>Playing</b>
          </div>
          {playing.length === 0 ? (
            <div style={muted}>You’re not in any tournaments yet.</div>
          ) : (
            <ul style={list}>
              {playing.map((t) => (
                <li key={t.id} style={row}>
                  <div>
                    <div style={titleLine}>
                      <span>{t.name}</span>
                      {t.status === 'active' && <span style={livePill}>Live</span>}
                      {t.status === 'completed' && <span style={donePill}>Done</span>}
                    </div>
                    <div style={sub}>
                      {t.players?.length ?? 0} players •{' '}
                      {t.code ? 'Private' : 'Public'}
                    </div>
                  </div>
                  <Link href={`/t/${t.id}`} style={goBtn} prefetch>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/* ===== styles (matches your old look) ===== */
const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  fontFamily: 'system-ui',
  padding: 24,
};
const container: React.CSSProperties = {
  maxWidth: 980,
  margin: '0 auto',
  display: 'grid',
  gap: 14,
};
const h1: React.CSSProperties = { margin: '4px 0 8px', fontSize: 20 };
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 14,
  padding: 14,
};
const rowHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 8,
};
const hint: React.CSSProperties = { opacity: 0.7, fontSize: 12 };
const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 };
const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderRadius: 10,
  background: '#111',
  padding: '10px 12px',
  border: '1px solid rgba(255,255,255,.12)',
};
const titleLine: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const sub: React.CSSProperties = { opacity: 0.75, fontSize: 12, marginTop: 2 };
const muted: React.CSSProperties = { opacity: 0.75 };
const livePill: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(16,185,129,.22)',
  border: '1px solid rgba(16,185,129,.45)',
  fontSize: 12,
};
const donePill: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(148,163,184,.18)',
  border: '1px solid rgba(148,163,184,.4)',
  fontSize: 12,
};
const goBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  background: '#0ea5e9',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  border: 'none',
};
const errorBox: React.CSSProperties = {
  background: 'rgba(239,68,68,.12)',
  border: '1px solid rgba(239,68,68,.35)',
  borderRadius: 12,
  padding: '8px 10px',
};
