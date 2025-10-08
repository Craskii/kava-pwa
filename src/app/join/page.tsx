// src/app/join/page.tsx
'use client';
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import BackButton from "../../components/BackButton";
import { findByCodeRemote, getTournamentRemote, saveTournamentRemote, uid } from "../../lib/storage";

export default function Join() {
  const r = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  async function submit() {
    setErr(null);
    try {
      // ensure identity saved with chosen name
      let meObj = me;
      if (!meObj) {
        meObj = { id: uid(), name: name?.trim() || "Guest" };
      } else if (name?.trim()) {
        meObj = { ...meObj, name: name.trim() };
      }
      localStorage.setItem("kava_me", JSON.stringify(meObj));

      const id = await findByCodeRemote(code.trim());
      if (!id) { setErr("No tournament with that code."); return; }

      const t = await getTournamentRemote(id);
      if (!t) { setErr("Could not load tournament."); return; }

      // add to pending if not already there
      const mine = t.players.some(p => p.id === meObj.id) || t.pending.some(p => p.id === meObj.id);
      if (!mine) {
        t.pending.push({ id: meObj.id, name: meObj.name });
        await saveTournamentRemote(t);
      }

      r.push("/me"); // go to My tournaments
    } catch {
      setErr("Could not reach server.");
    }
  }

  return (
    <main style={{ padding:24 }}>
      <BackButton />
      <h1>Join with Code</h1>
      <div style={{ display:"grid", gap:10, maxWidth: 360 }}>
        <input
          value={name}
          onChange={e=>setName(e.target.value)}
          placeholder="Your name"
          style={input}
        />
        <input
          value={code}
          onChange={e=>setCode(e.target.value)}
          placeholder="4-digit code"
          style={input}
        />
        <button onClick={submit} style={btn}>Join</button>
        {err && <div style={{ color:"#ff6b6b" }}>{err}</div>}
      </div>
    </main>
  );
}

const input: React.CSSProperties = { padding:"10px 12px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
const btn: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" };
