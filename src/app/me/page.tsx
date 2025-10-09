// src/app/me/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BackButton from "../../components/BackButton";
import { Tournament } from "../../lib/storage";
import { startSmartPoll } from "../../lib/poll";

type Me = { id: string; name: string } | null;

export default function MePage() {
  // read identity
  const me: Me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); }
    catch { return null; }
  }, []);

  const [hosting, setHosting] = useState<Tournament[]>([]);
  const [playing, setPlaying] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<{ stop: () => void; bump: () => void } | null>(null);

  // fetch helper that also returns a version string from headers
  async function fetchMine(userId: string): Promise<{ v: string; hosting: Tournament[]; playing: Tournament[] }> {
    const res = await fetch(`/api/tournaments?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text().catch(()=>"HTTP "+res.status));
    const v = res.headers.get("x-t-version") || ""; // combined version from API
    const data = await res.json() as { hosting: Tournament[]; playing: Tournament[] };
    const coerce = (t: Tournament) => ({ ...t, v: Number((t as any).v ?? 0) });
    return { v, hosting: data.hosting.map(coerce), playing: data.playing.map(coerce) };
  }

  // initial load + smart poll (updates live)
  useEffect(() => {
    if (!me?.id) return;
    setLoading(true);
    setErr(null);

    pollRef.current?.stop();
    const poll = startSmartPoll(async () => {
      const { v, hosting, playing } = await fetchMine(me.id);
      // newest first
      const sortByCreated = (a: Tournament, b: Tournament) =>
        (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      setHosting([...hosting].sort(sortByCreated));
      setPlaying([...playing].sort(sortByCreated));
      setLoading(false);
      return v; // smartPoll compares this; if it changes, keep polling fast, else slow down
    });

    // refresh when tab becomes visible again
    const onVis = () => poll.bump();
    document.addEventListener("visibilitychange", onVis);

    pollRef.current = poll;
    return () => { document.removeEventListener("visibilitychange", onVis); poll.stop(); };
  }, [me?.id]);

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ display:"grid", gap:18, width:"100%", maxWidth:1000 }}>
        <h1 style={{ margin:"8px 0 4px" }}>My tournaments</h1>

        {err && <div style={error}>{err}</div>}

        <section style={card}>
          <div style={sectionHeader}>
            <h3 style={{ margin:0 }}>Hosting</h3>
            <div style={{ opacity:.7, fontSize:12 }}>{loading ? "Refreshing…" : "Live"}</div>
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
            <div style={grid}>
              {playing.map(t => (
                <div key={t.id} style={item}>
                  <div style={{ fontWeight:700 }}>{t.name}</div>
                  <div style={sub}>Code: {t.code || "—"} • {t.players.length} players</div>
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <Link href={`/t/${t.id}`} style={btn}>Open</Link>
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
const sectionHeader: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 };
const sub: React.CSSProperties = { opacity:.75, fontSize:13 };
const muted: React.CSSProperties = { opacity:.7, fontSize:13 };
const error: React.CSSProperties = { background:"#7f1d1d", border:"1px solid #b91c1c", padding:10, borderRadius:8 };
