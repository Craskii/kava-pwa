// src/app/list/[id]/page.tsx
'use client';
export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import {
  getListRemote,
  listJoin,
  listLeave,
  listILost,
  listSetTables,
  ListGame,
  Player,
  uid,
} from '@/lib/storage';
import { startAdaptivePoll } from '@/lib/poll';

/* ---------- helpers ---------- */
function coerceList(x: any): ListGame | null {
  if (!x) return null;
  try {
    return {
      id: String(x.id ?? ''),
      name: String(x.name ?? 'Untitled'),
      code: x.code ? String(x.code) : undefined,
      hostId: String(x.hostId ?? ''),
      status: 'active',
      createdAt: Number(x.createdAt ?? Date.now()),
      tables: Array.isArray(x.tables)
        ? x.tables.map((t: any) => ({ a: t?.a, b: t?.b }))
        : [],
      players: Array.isArray(x.players)
        ? x.players.map((p: any) => ({
            id: String(p?.id ?? ''),
            name: String(p?.name ?? 'Player'),
          }))
        : [],
      queue: Array.isArray(x.queue) ? x.queue.map((id: any) => String(id)) : [],
      v: Number(x.v ?? 0),
    };
  } catch {
    return null;
  }
}

/** detect if my seating changed, to trigger sound/alerts */
function makeSeatingChangeDetector(meId: string) {
  const lastSeating = { current: '' };
  return (next: ListGame | null) => {
    if (!next) return false;
    const tables = Array.isArray(next.tables) ? next.tables : [];
    const i = tables.findIndex((t) => t.a === meId || t.b === meId);
    if (i < 0) {
      if (lastSeating.current !== '') {
        lastSeating.current = '';
        return true;
      }
      return false;
    }
    const a = tables[i]?.a ?? 'x';
    const b = tables[i]?.b ?? 'x';
    const key = `table-${i}-${a}-${b}`;
    if (key !== lastSeating.current) {
      lastSeating.current = key;
      return true;
    }
    return false;
  };
}

export default function ListLobby() {
  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState('');

  // numeric version from x-l-version (used for If-Match on PUT)
  const verRef = useRef<string | null>(null);

  // derive ID from URL (client)
  const id =
    typeof window !== 'undefined'
      ? decodeURIComponent(window.location.pathname.split('/').pop() || '')
      : '';

  const me = useMemo<Player>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem('kava_me') || 'null') || {
          id: uid(),
          name: 'Player',
        }
      );
    } catch {
      return { id: uid(), name: 'Player' };
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('kava_me', JSON.stringify(me));
  }, [me]);

  const detectMySeatingChanged = useMemo(
    () => makeSeatingChangeDetector(me.id),
    [me.id]
  );

  // Alerts
  useQueueAlerts({
    listId: id,
    upNextMessage: 'your up next get ready!!',
    matchReadyMessage: (s: any) => {
      const raw = s?.tableNumber ?? s?.table?.number ?? null;
      const n = Number(raw);
      const shown = Number.isFinite(n) ? (n === 0 || n === 1 ? n + 1 : n) : null;
      return shown ? `Your in table (#${shown})` : 'Your in table';
    },
  });

  /* ---------- network helpers (GET/PUT with version) ---------- */

  async function getOnce() {
    if (!id) return null;
    const res = await fetch(`/api/list/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('load-failed');
    const json = await res.json();
    const doc = coerceList(json);
    // capture numeric version for If-Match
    verRef.current = res.headers.get('x-l-version');
    return doc;
  }

  async function putDoc(next: ListGame) {
    const res = await fetch(`/api/list/${encodeURIComponent(next.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(verRef.current ? { 'if-match': verRef.current } : {}),
      },
      body: JSON.stringify(next),
    });
    // API returns 204 No Content on success (still with headers)
    if (!res.ok && res.status !== 204) {
      throw new Error(`save-failed-${res.status}`);
    }
    // update numeric version for subsequent saves
    const v = res.headers.get('x-l-version');
    if (v) verRef.current = v;
  }

  /* ---------- initial load + adaptive polling (ETag 304) ---------- */

  useEffect(() => {
    if (!id) return;
    let stopped = false;

    const stopper = startAdaptivePoll<ListGame>({
      key: `l:${id}`,
      minMs: 4000,
      maxMs: 60000,
      fetchOnce: async (etag) => {
        const res = await fetch(`/api/list/${encodeURIComponent(id)}`, {
          headers: etag ? { 'If-None-Match': etag } : undefined,
          cache: 'no-store',
        });

        // keep numeric version in sync (needed for PUT If-Match)
        const vHdr = res.headers.get('x-l-version');
        if (vHdr) verRef.current = vHdr;

        if (res.status === 304) return { status: 304, etag: etag ?? null };
        if (!res.ok) return { status: 304, etag: etag ?? null };

        const payload = await res.json();
        const newTag = res.headers.get('etag') || res.headers.get('x-l-version') || null;
        return { status: 200, etag: newTag, payload };
      },
      onChange: (payload) => {
        if (stopped) return;
        const doc = coerceList(payload);
        if (!doc || !doc.id || !doc.hostId) return; // guard
        setG(doc);
        if (detectMySeatingChanged(doc)) bumpAlerts();
      },
    });

    // Also do a fast initial fetch to paint quickly & set version for saves.
    (async () => {
      try {
        const doc = await getOnce();
        if (doc) {
          setG(doc);
          if (detectMySeatingChanged(doc)) bumpAlerts();
        }
      } catch {}
    })();

    return () => {
      stopped = true;
      stopper.stop();
    };
  }, [id, detectMySeatingChanged]);

  /* ---------- derived data ---------- */
  const safeTables = Array.isArray(g?.tables) ? g!.tables : [];
  const safeQueue = Array.isArray(g?.queue) ? g!.queue : [];
  const safePlayers = Array.isArray(g?.players) ? g!.players : [];

  const myTableIndex = safeTables.findIndex(
    (t) => t.a === me.id || t.b === me.id
  );
  const seated = myTableIndex >= 0;
  const queued = safeQueue.includes(me.id);

  const oneActive = safeTables.length === 1;
  const twoActive = safeTables.length >= 2;

  /* ---------- UI actions ---------- */

  async function onCopy() {
    if (!g?.code) return;
    await navigator.clipboard.writeText(g.code);
    alert('Code copied!');
  }

  async function refreshOnce() {
    try {
      setBusy(true);
      const doc = await getOnce();
      if (doc) setG(doc);
    } catch {
      // no-op
    } finally {
      setBusy(false);
    }
  }

  async function save(mut: (x: ListGame) => void) {
    if (!g || busy) return;
    setBusy(true);
    try {
      // reload latest and its version before mutating, to minimize conflicts
      const latest = await getOnce();
      const base = coerceList(latest) || g;
      const next = structuredClone(base);
      mut(next);
      await putDoc(next);
      setG(next);
      bumpAlerts();
    } catch {
      alert('Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function onAddPlayerManual() {
    const nm = nameField.trim();
    if (!g || busy || !nm) return;
    await save((draft) => {
      const p: Player = { id: uid(), name: nm };
      const updated = listJoin(draft, p);
      Object.assign(draft, coerceList(updated));
    });
    setNameField('');
  }

  async function onAddMe() {
    if (!g || busy) return;
    await save((draft) => {
      const updated = listJoin(draft, me);
      Object.assign(draft, coerceList(updated));
    });
  }

  async function onRemovePlayer(pid: string) {
    if (!g || busy) return;
    await save((draft) => {
      const updated = listLeave(draft, pid);
      Object.assign(draft, coerceList(updated));
    });
  }

  async function onJoinQueue() {
    if (!g || busy) return;
    await save((draft) => {
      const updated = listJoin(draft, me);
      Object.assign(draft, coerceList(updated));
    });
  }

  async function onLeaveQueue() {
    if (!g || busy) return;
    await save((draft) => {
      const updated = listLeave(draft, me.id);
      Object.assign(draft, coerceList(updated));
    });
  }

  async function onILost() {
    if (!g || busy) return;
    const idx = safeTables.findIndex((t) => t.a === me.id || t.b === me.id);
    if (idx < 0) {
      alert('You are not seated right now.');
      return;
    }
    await save((draft) => {
      const updated = listILost(draft, idx, me.id);
      Object.assign(draft, coerceList(updated));
    });
    alert("It's ok — join again by pressing “Join queue”.");
  }

  async function onTables(count: 1 | 2) {
    if (!g || busy) return;
    await save((draft) => {
      const updated = listSetTables(draft, count);
      Object.assign(draft, coerceList(updated));
    });
  }

  /* ---------- render ---------- */

  if (!g) {
    return (
      <main style={wrap}>
        <BackButton href="/lists" />
        <p style={{ opacity: 0.7 }}>Loading…</p>
        <div>
          <button style={btnGhostSm} onClick={refreshOnce} disabled={busy}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <BackButton href="/lists" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={pill}>Live</span>
          <AlertsToggle />
          <button style={btnGhostSm} onClick={refreshOnce} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <div>
          <h1 style={{ margin: '8px 0 4px' }}>
            <input
              defaultValue={g.name}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (!v || v === g.name) return;
                onRename(v);
              }}
              style={nameInput}
              disabled={busy}
            />
          </h1>
          <div
            style={{
              opacity: 0.8,
              fontSize: 14,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            Private code: <b>{g.code || '—'}</b>{' '}
            {g.code && (
              <button style={chipBtn} onClick={onCopy}>
                Copy
              </button>
            )}{' '}
            • {safePlayers.length}{' '}
            {safePlayers.length === 1 ? 'player' : 'players'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {!seated && !queued && (
            <button style={btn} onClick={onJoinQueue} disabled={busy}>
              Join queue
            </button>
          )}
          {queued && (
            <button style={btnGhost} onClick={onLeaveQueue} disabled={busy}>
              Leave queue
            </button>
          )}
          {seated && (
            <button style={btnGhost} onClick={onILost} disabled={busy}>
              I lost
            </button>
          )}
        </div>
      </header>

      <section style={notice}>
        <b>How it works:</b> One shared queue feeds both tables. When someone
        taps <i>“I lost”</i>, the next person in the queue sits at whichever
        table frees up first.
      </section>

      {g.hostId === me.id && (
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Host controls</h3>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <button
              style={oneActive ? btnActive : btn}
              onClick={() => onTables(1)}
              disabled={busy}
            >
              1 Table
            </button>
            <button
              style={twoActive ? btnActive : btnGhost}
              onClick={() => onTables(2)}
              disabled={busy}
            >
              2 Tables
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <input
              placeholder="Add player name..."
              value={nameField}
              onChange={(e) => setNameField(e.target.value)}
              style={input}
              disabled={busy}
            />
            <button
              style={btn}
              onClick={onAddPlayerManual}
              disabled={busy || !nameField.trim()}
            >
              Add player
            </button>
            <button style={btnGhost} onClick={onAddMe} disabled={busy}>
              Add me
            </button>
          </div>

          <div>
            <h4 style={{ margin: '6px 0' }}>
              Players ({safePlayers.length})
            </h4>
            {safePlayers.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No players yet.</div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'grid',
                  gap: 8,
                }}
              >
                {safePlayers.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#111',
                      padding: '10px 12px',
                      borderRadius: 10,
                    }}
                  >
                    <span>{p.name}</span>
                    <button
                      style={btnGhost}
                      onClick={() => onRemovePlayer(p.id)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Queue ({safeQueue.length})</h3>
        {safeQueue.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No one in queue.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {safeQueue.map((qid) => {
              const name = safePlayers.find((p) => p.id === qid)?.name || '??';
              return (
                <li key={qid} style={{ margin: '6px 0' }}>
                  {name}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Tables</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))',
            gap: 12,
          }}
        >
          {safeTables.map((t, i) => {
            const a =
              safePlayers.find((p) => p.id === t.a)?.name ||
              (t.a ? '??' : '—');
            const b =
              safePlayers.find((p) => p.id === t.b)?.name ||
              (t.b ? '??' : '—');
            const meHere = t.a === me.id || t.b === me.id;
            return (
              <div
                key={i}
                style={{
                  background: '#111',
                  borderRadius: 12,
                  padding: '10px 12px',
                  border: '1px solid rgba(255,255,255,.12)',
                }}
              >
                <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 6 }}>
                  Table {i + 1}
                </div>
                <div style={{ minHeight: 22 }}>
                  {a} vs {b}
                </div>
                {meHere && (
                  <div style={{ marginTop: 8 }}>
                    <button style={btnMini} onClick={onILost} disabled={busy}>
                      I lost
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );

  // rename list title
  async function onRename(newName: string) {
    if (!g || busy) return;
    await save((draft) => {
      draft.name = newName;
    });
  }
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0b0b0b',
  color: '#fff',
  padding: 24,
  fontFamily: 'system-ui',
};
const notice: React.CSSProperties = {
  background: 'rgba(14,165,233,.12)',
  border: '1px solid rgba(14,165,233,.25)',
  borderRadius: 12,
  padding: '10px 12px',
  margin: '8px 0 14px',
};
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 14,
  padding: 14,
  marginBottom: 14,
};
const pill: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(16,185,129,.2)',
  border: '1px solid rgba(16,185,129,.35)',
  fontSize: 12,
};
const btn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
};
const btnActive: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#0ea5e9',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
const btnGhostSm: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
};
const btnMini: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
};
const chipBtn: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
};
const input: React.CSSProperties = {
  width: 260,
  maxWidth: '90vw',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#111',
  color: '#fff',
};
const nameInput: React.CSSProperties = {
  background: '#111',
  border: '1px solid #333',
  color: '#fff',
  borderRadius: 10,
  padding: '8px 10px',
  width: 'min(420px, 80vw)',
};
