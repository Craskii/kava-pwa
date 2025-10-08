// src/app/me/page.tsx
'use client';

import Link from "next/link";
import BackButton from "../../components/BackButton";
import { useEffect, useMemo, useState } from "react";
import {
  listTournamentsRemote, getTournamentRemote, saveTournamentRemote, deleteTournamentRemote,
  Tournament
} from "../../lib/storage";

export default function Me() {
  const me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  const [items, setItems] = useState<Tournament[]>([]);
  const userId = me?.id;

  // live-ish updates so actions from other devices appear here
  useEffect(() => {
    let stop = false;
    async function load() {
      if (!userId) return;
      const data = await listTournamentsRemote(userId);
      if (!stop) setItems(data);
    }
    load();
    const t = setInterval(load, 1500);
    return () => { stop = true; clearInterval(t); };
  }, [userId]);

  async function leave(t: Tournament) {
    if (!userId) return;
    const fresh = await getTournamentRemote(t.id);
    if (!fresh) return;
    // remove me from everywhere
    fresh.players   = fresh.players.filter(p => p.id !== userId);
    fresh.pending   = fresh.pending.filter(p => p.id !== userId);
    fresh.queue     = fresh.queue.filter(id => id !== userId);
    fresh.rounds    = fresh.rounds.map(round => round.map(m => ({
      ...m,
      a: m.a === userId ? undefined : m.a,
      b: m.b === userId ? undefined : m.b,
      winner: m.winner === userId ? undefined : m.winner,
      reports: Object.fromEntries(Object.entries(m.reports || {}).filter(([k]) => k !== userId)),
    })));
    await saveTournamentRemote(fresh);
  }

  async function remove(t: Tournament) {
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    await deleteTournamentRemote(t.id);
  }

  return (
    <main style={{ padding: 24, color: "#fff" }}>
      <BackButton />
      <h1 style={{ marginTop: 8 }}>My tournaments</h1>
      {!me?.id && <p>Set your name on the home page first.</p>}

      <div style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 720 }}>
        {items.length === 0 && <div style={{ opacity:.8 }}>You’re not in any tournaments yet.</div>}
        {items.map(t => {
          const iHost = t.hostId === userId;
          const role =
            iHost ? "Host"
            : t.players.some(p => p.id === userId) ? "Player"
            : t.pending.some(p => p.id === userId) ? "Pending"
            : "Guest";

          return (
            <div key={t.id} style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  <Link href={`/t/${t.id}`}>{t.name}</Link>
                </div>
                <div style={{ fontSize: 13, opacity:.8 }}>
                  {t.code ? <>code <b>{t.code}</b> • </> : null}
                  {t.players.length} players • {role}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/t/${t.id}`} style={btn}>Open</Link>
                {iHost
                  ? <button onClick={() => remove(t)} style={btnGhostDanger}>Delete</button>
                  : <button onClick={() => leave(t)} style={btnGhost}>Leave</button>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer", textDecoration:"none" };
const btnGhost: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const btnGhostDanger: React.CSSProperties = { ...btnGhost, borderColor:"#ff6b6b", color:"#ff6b6b" };
