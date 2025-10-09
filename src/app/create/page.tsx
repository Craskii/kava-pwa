// src/app/create/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import BackButton from "../../components/BackButton";
import { uid } from "../../lib/storage";

export default function CreatePage() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onCreate() {
    setMsg(null);
    const n = name.trim() || "Untitled Tournament";
    setLoading(true);

    let me: { id: string; name: string } | null = null;
    try { me = JSON.parse(localStorage.getItem("kava_me") || "null"); } catch {}
    if (!me) {
      me = { id: uid(), name: "Host" };
      localStorage.setItem("kava_me", JSON.stringify(me));
    }

    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n, hostId: me.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      r.push("/me");   // <- go to My tournaments
    } catch (e) {
      setMsg("Could not create tournament.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background:"#0b1220", color:"#fff", padding:16 }}>
      <BackButton />
      <h1>Create tournament</h1>
      <input
        value={name}
        onChange={e=>setName(e.target.value)}
        placeholder="Tournament name"
        style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" }}
      />
      <button
        onClick={onCreate}
        disabled={loading}
        style={{ marginTop:10, padding:"12px 16px", borderRadius:12, background:"#0ea5e9", border:"none", color:"#fff", fontWeight:700 }}
      >
        {loading ? "Creating…" : "Create"}
      </button>
      {msg && <p style={{ color:"#fca5a5", marginTop:8 }}>{msg}</p>}
    </main>
  );
}
