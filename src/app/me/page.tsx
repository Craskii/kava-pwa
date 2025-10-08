// src/app/me/page.tsx
'use client';
import Link from "next/link";
import BackButton from "../../components/BackButton";
import { useEffect, useMemo, useState } from "react";
import { listTournamentsRemote, Tournament } from "../../lib/storage";

export default function Me() {
  const me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  const [items, setItems] = useState<Tournament[]>([]);

  useEffect(() => {
    let stop = false;
    async function load() {
      if (!me?.id) return;
      const data = await listTournamentsRemote(me.id);
      if (!stop) setItems(data);
    }
    load();
    const t = setInterval(load, 2000); // tiny polling keeps the list fresh
    return () => { stop = true; clearInterval(t); };
  }, [me?.id]);

  return (
    <main style={{ padding: 24 }}>
      <BackButton />
      <h1>My tournaments</h1>
      {!me?.id && <p>Set your name on the home page first.</p>}
      <ul>
        {items.map(t => (
          <li key={t.id}>
            <Link href={`/t/${t.id}`}>{t.name}</Link> {t.code ? <>• code <b>{t.code}</b></> : null}
          </li>
        ))}
        {items.length === 0 && <li>None yet.</li>}
      </ul>
    </main>
  );
}
