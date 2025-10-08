// src/app/_me/page.tsx
"use client";
export const runtime = "edge";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BackButton from "../../components/BackButton";
import { listTournamentsRemote, Tournament } from "../../lib/storage";

type Me = { id: string; name: string } | null;

export default function MePage() {
  const me: Me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await listTournamentsRemote(me?.id);
        setItems(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [me?.id]);

  return (
    <main style={{ minHeight:"100vh", background:"#0b0b0b", color:"#fff", padding:24 }}>
      <BackButton />
      <h1 style={{ margin:"8px 0 16px" }}>Your profile</h1>

      {!me && <p style={{ opacity:.8 }}>No profile yet. Create a tournament and we’ll save your host identity locally.</p>}
      {me && (
        <div style={{ marginBottom:16 }}>
          <div>Name: <b>{me.name}</b></div>
          <div style={{ opacity:.8, fontSize:12 }}>Host ID: {me.id}</div>
        </div>
      )}

      <h2 style={{ margin:"16px 0 8px" }}>Your tournaments</h2>
      {loading && <p>Loading…</p>}
      {!loading && items.length === 0 && <p style={{ opacity:.8 }}>No tournaments found.</p>}

      <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gap:10 }}>
        {items.map(t => (
          <li key={t.id} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"12px 14px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontWeight:700 }}>{t.name}</div>
                <div style={{ opacity:.75, fontSize:12 }}>
                  {t.code ? `Code: ${t.code}` : "Public"} • {t.players.length} players • {t.status}
                </div>
              </div>
              <Link href={`/t/${t.id}`} style={{ color:"#0ea5e9", fontWeight:700, textDecoration:"none", alignSelf:"center" }}>
                Open →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
