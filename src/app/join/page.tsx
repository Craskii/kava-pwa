// src/app/join/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import BackButton from "../../components/BackButton";
import { uid } from "../../lib/storage";

export default function JoinPage() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); }
    catch { return null; }
  }, []);

  function ensureMe(n: string) {
    let m = me as { id: string; name: string } | null;
    if (!m) m = { id: uid(), name: n || "Player" };
    else if (n && m.name !== n) m = { ...m, name: n };
    localStorage.setItem("kava_me", JSON.stringify(m));
    return m!;
  }

  async function onJoin() {
    if (busy) return;
    setErr(null);

    const n = name.trim() || "Player";
    const c = code.replace(/[^0-9]/g, "").slice(0, 5);
    if (c.length !== 5) { setErr("Enter the 5-digit code."); return; }

    setBusy(true);
    try {
      const m = ensureMe(n); // <-- make sure server gets the chosen name
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: c, player: m }), // server adds to pending
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());

      // Success: go to “My tournaments” (your spec)
      r.push("/me");
      r.refresh();
    } catch (e) {
      console.error(e);
      setErr("Could not join. Check the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight:"100vh", background:"#0b1220", color:"#fff", padding:16 }}>
      <BackButton href="/" />
      <h1>Join a tournament</h1>
      <input
        value={name}
        onChange={e=>setName(e.target.value)}
        placeholder="Your name"
        style={input}
        disabled={busy}
      />
      <input
        value={code}
        onChange={e=>setCode(e.target.value.replace(/[^0-9]/g, "").slice(0,5))}
        placeholder="5-digit code"
        inputMode="numeric"
        style={{ ...input, marginTop:8 }}
        disabled={busy}
      />
      <button onClick={onJoin} disabled={busy} style={{ ...btn, opacity: busy ? .7 : 1, pointerEvents: busy ? "none" : "auto" }}>
        {busy ? "Joining…" : "Join"}
      </button>
      {err && <p style={{ color:"#fca5a5", marginTop:8 }}>{err}</p>}
    </main>
  );
}

const input: React.CSSProperties = {
  width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff"
};
const btn: React.CSSProperties = {
  marginTop:10, padding:"12px 16px", borderRadius:12, background:"#0ea5e9", border:"none", color:"#fff", fontWeight:700, cursor:"pointer"
};
