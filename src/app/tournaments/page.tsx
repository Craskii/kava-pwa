'use client';
export const runtime = 'edge';

import Link from 'next/link';
import BackButton from '../components/BackButton';
import { useEffect, useState } from 'react';

type Me = { id: string; name: string };
type TournamentRow = { id: string; name: string; status?: string; players?: any[] };

function getMe(): Me {
  try {
    const saved = JSON.parse(localStorage.getItem('kava_me') || 'null');
    if (saved?.id && saved?.name !== undefined) return saved;
  } catch {}
  const me = { id: crypto.randomUUID(), name: '' };
  localStorage.setItem('kava_me', JSON.stringify(me));
  return me;
}

export default function TournamentsPage() {
  const [me] = useState<Me>(() => getMe());
  const [hosting, setHosting] = useState<TournamentRow[] | null>(null);
  const [playing, setPlaying] = useState<TournamentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      setHosting(null);
      setPlaying(null);
      try {
        const res = await fetch(`/api/tournaments?userId=${me.id}`, {
          cache: 'no-store',
        });
        const text = await res.text();

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          // Not JSON -> surface the raw body
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }

        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }

        setHosting(data.hosting || []);
        setPlaying(data.playing || []);
      } catch (e: any) {
        setError(
          `Couldn't load tournaments. ${e?.message || String(e)}`
        );
        setHosting([]);
        setPlaying([]);
      }
    })();
  }, [me.id]);

  return (
    <main style={{ minHeight: '100vh', background: '#0b0b0b', color: '#fff', fontFamily: 'system-ui', padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <BackButton href="/" />
      </div>

      <h2 style={{ margin: '0 0 10px' }}>My tournaments</h2>

      {error && (
        <div style={{padding: '10px 12px', border: '1px solid rgba(255,80,80,.35)', background: 'rgba(255,80,80,.1)', borderRadius: 10, marginBottom: 10}}>
          {error}
        </div>
      )}

      <section style={{ display: 'grid', gap: 12 }}>
        <Card title="Hosting" right="Live">
          {hosting === null ? (
            <span>Loading...</span>
          ) : hosting.length === 0 ? (
            <span>You're not hosting any tournaments yet.</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {hosting.map((t) => (
                <li key={t.id}>
                  <Link href={`/t/${t.id}`}>{t.name || t.id}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Playing">
          {playing === null ? (
            <span>Loading...</span>
          ) : playing.length === 0 ? (
            <span>You're not in any tournaments yet.</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {playing.map((t) => (
                <li key={t.id}>
                  <Link href={`/t/${t.id}`}>{t.name || t.id}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </main>
  );
}

function Card(props: { title: string; right?: string; children: any }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{props.title}</strong>
        <span style={{ opacity: 0.6 }}>{props.right}</span>
      </div>
      <div>{props.children}</div>
    </div>
  );
}
