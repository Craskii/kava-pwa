'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BackButton from "../../components/BackButton";
import { listTournaments, Tournament } from "../../lib/storage";

type Me = { id: string; name: string } | null;

export default function MyTournamentsPage() {
  const [hosted, setHosted] = useState<Tournament[]>([]);
  const [joined, setJoined] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const me: Me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); }
    catch { return null; }
  }, []);

  useEffect(() => {
    if (!me) { setHosted([]); setJoined([]); setLoading(false); return; }
    const all = listTournaments();
    setHosted(all.filter(t => t.hostId === me.id));
    setJoined(all.filter(t => t.players.some(p => p.id === me.id)));
    setLoading(false);
  }, [me]);

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width:"100%", maxWidth:900, display:"grid", gap:18 }}>
        <header>
          <h1 style={{ margin:"8px 0 6px" }}>My Tournaments</h1>
          <div style={{ opacity:.75 }}>
            {me ? <>Signed in as <b>{me.name}</b> (this device)</> : "Not identified yet — join or create to appear here."}
          </div>
        </header>

        {loading && <Card><p>Loading…</p></Card>}

        {!loading && (
          <>
            <Card>
              <h3 style={h3}>You host ({hosted.length})</h3>
              {hosted.length === 0 ? (
                <Empty>None yet. <Link href="/create" style={link}>Create one →</Link></Empty>
              ) : (
                <ul style={list}>
                  {hosted.map(t => (
                    <li key={t.id} style={row}>
                      <div>
                        <div style={title}>{t.name}</div>
                        <div style={meta}>
                          {t.code ? <>Private code: <b>{t.code}</b></> : "Public"}
                          {" • "}{t.players.length} players
                        </div>
                      </div>
                      <Link href={`/t/${t.id}`} style={btnPrimary}>Edit</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h3 style={h3}>You joined ({joined.length})</h3>
              {joined.length === 0 ? (
                <Empty>Not in any yet. <Link href="/join" style={link}>Join with code →</Link></Empty>
              ) : (
                <ul style={list}>
                  {joined.map(t => {
                    const meIdx = me ? t.queue.findIndex(id => id === me.id) : -1;
                    return (
                      <li key={t.id} style={row}>
                        <div>
                          <div style={title}>{t.name}</div>
                          <div style={meta}>
                            {t.players.length} players
                            {meIdx >= 0 && <> • Your queue position: <b>#{meIdx + 1}</b></>}
                          </div>
                        </div>
                        <Link href={`/t/${t.id}`} style={btnGhost}>View</Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

/* styles */
const wrap: React.CSSProperties = { minHeight:"100vh", background:"#0b0b0b", color:"#fff", fontFamily:"system-ui", padding:24, position:"relative" };
const Card = (props: React.PropsWithChildren) => (
  <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:14 }}>
    {props.children}
  </div>
);
const h3: React.CSSProperties = { margin:"0 0 10px" };
const list: React.CSSProperties = { listStyle:"none", padding:0, margin:0, display:"grid", gap:10 };
const row: React.CSSProperties = { display:"flex", justifyContent:"space-between", alignItems:"center", background:"#111", padding:"10px 12px", borderRadius:10 };
const title: React.CSSProperties = { fontWeight:700 };
const meta: React.CSSProperties = { opacity:.75, fontSize:12, marginTop:4 };
const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, textDecoration:"none" };
const btnGhost: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", color:"#fff", textDecoration:"none" };
const link: React.CSSProperties = { color:"#0ea5e9", textDecoration:"none" };
const Empty = (props: React.PropsWithChildren) => <div style={{ opacity:.85 }}>{props.children}</div>;
