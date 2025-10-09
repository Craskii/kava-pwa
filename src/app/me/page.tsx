// src/app/me/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BackButton from "../../components/BackButton";
import {
  Tournament,
  getTournamentRemote,
  saveTournamentRemote,
  deleteTournamentRemote,
  listTournamentsRemoteForUser,
} from "../../lib/storage";
import { startSmartPoll } from "../../lib/poll";

type Me = { id: string; name: string } | null;

export default function MePage() {
  const me: Me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); }
    catch { return null; }
  }, []);

  const [hosting, setHosting] = useState<Tournament[]>([]);
  const [playing, setPlaying] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<{ stop: () => void } | null>(null);

  async function refreshOnce(): Promise<number | null> {
    if (!me?.id) return null;
    setErr(null);
    setLoading(true);
    try {
      const data = await listTournamentsRemoteForUser(me.id);
      const sortByCreated = (a: Tournament, b: Tournament) => (b.createdAt || 0) - (a.createdAt || 0);
      setHosting([...data.hosting].sort(sortByCreated));
      setPlaying([...data.playing].sort(sortByCreated));
      return data.listVersion || 0;
    } catch (e) {
      console.error(e);
      setErr("Could not load tournaments.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    pollRef.current?.stop?.();
    if (!me?.id) return;
    const poll = startSmartPoll(async () => {
      const u = new URL(`/api/tournaments?userId=${encodeURIComponent(me.id)}`, window.location.origin);
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      const sortByCreated = (a: Tournament, b: Tournament) => (b.createdAt || 0) - (a.createdAt || 0);
      setHosting([...json.hosting].sort(sortByCreated));
      setPlaying([...json.playing].sort(sortByCreated));
      return json.listVersion || 0;
    });
    pollRef.current = poll;
    return () => poll.stop();
  }, [me?.id]);

  async function leaveTournament(t: Tournament) {
    if (!me?.id) return;
    const latest = await getTournamentRemote(t.id);
    if (!latest) return;

    const id = me.id;
    latest.players = (latest.players || []).filter(p => p.id !== id);
    latest.pending = (latest.pending || []).filter(p => p.id !== id);
    latest.queue   = (latest.queue   || []).filter(pid => pid !== id);
    latest.rounds = (latest.rounds || []).map(round =>
      round.map(m => ({
        ...m,
        a: m.a === id ? undefined : m.a,
        b: m.b === id ? undefined : m.b,
        winner: m.winner === id ? undefined : m.winner,
        reports: Object.fromEntries(Object.entries(m.reports || {}).filter(([k]) => k !== id)),
      }))
    );

    await saveTournamentRemote(latest);
    await refreshOnce();
  }

  async function deleteTournament(t: Tournament) {
    if (!me?.id || t.hostId !== me.id) return;
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    await deleteTournamentRemote(t.id);
    await refreshOnce();
  }

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ display:"grid", gap:18, width:"100%", maxWidth:1000 }}>
        <h1 style={{ margin:"8px 0 4px" }}>My tournaments</h1>

        {err && <div style={error}>{err}</div>}

        <section style={card}>
          <div style={sectionHeader}>
            <h3 style={{ margin:0 }}>Hosting</h3>
            <button style={miniBtn} onClick={refreshOnce} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {hosting.length === 0 ? (
            <div style={muted}>You’re not hosting any tournaments yet.</div>
          ) : (
            <div style={grid}>
              {hosting.map(t => (
                <div key={t.id} style={item}>
                  <div style={{ fontWeight:700 }}>{t.name}</div>
                  <div style={sub}>Code: {t.code || "—"} • {t.players.length} players</div>
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <Link href={`/t/${t.id}`} style={btn}>Open</Link>
                    <button style={ghost} onClick={() => deleteTournament(t)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <h3 style={{ marginTop:0 }}>Playing</h3>
          {playing.length === 0 ? (
            <div style={muted}>You’re not in any tournaments yet.</div>
          ) : (
            <div style={grid}}>
              {playing.map(t => (
                <div key={t.id} style={item}>
                  <div style={{ fontWeight:700 }}>{t.name}</div>
                  <div style={sub}>Code: {t.code || "—"} • {t.players.length} players</div>
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <Link href={`/t/${t.id}`} style={btn}>Open</Link>
                    <button style={ghost} onClick={() => leaveTournament(t)}>Leave</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ---------- styles ---------- */
const wrap: React.CSSProperties = {
  minHeight:"100vh", background:"#0b0b0b", color:"#fff", fontFamily:"system-ui", padding:24
};
const card: React.CSSProperties = {
  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:14
};
const grid: React.CSSProperties = { display:"grid", gap:12 };
const item: React.CSSProperties = {
  background:"#111", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px 12px"
};
const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:10, background:"#0ea5e9", color:"#fff", textDecoration:"none", fontWeight:700 };
const ghost: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const miniBtn: React.CSSProperties = { ...ghost, padding:"6px 10px", fontSize:12 };
const sectionHeader: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 };
const sub: React.CSSProperties = { opacity:.75, fontSize:13 };
const muted: React.CSSProperties = { opacity:.7, fontSize:13 };
const error: React.CSSProperties = { background:"#7f1d1d", border:"1px solid #b91c1c", padding:10, borderRadius:8 };
