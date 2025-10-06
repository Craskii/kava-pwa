'use client';
import { useRouter } from "next/navigation";
import { useState } from "react";
import BackButton from "../../components/BackButton";
import { Tournament, saveTournament, uid } from "../../lib/storage";

export default function CreatePage() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = uid();
    const hostId = uid();
    const t: Tournament = {
  id,
  name: name || "Untitled Tournament",
  code: code || undefined,
  hostId,
  status: "setup",
  createdAt: Date.now(),
  players: [{ id: hostId, name: "Host" }],
  pending: [],
  queue: [hostId],
  rounds: [],
};

    saveTournament(t);
    // store "me" for this browser
    localStorage.setItem("kava_me", JSON.stringify({ id: hostId, name: "Host" }));
    r.push(`/t/${id}`);
  }

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={h1}>Create Tournament</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={label}>
            Name
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Bracket" />
          </label>
          <label style={label}>
            Private? (4-digit code)
            <input style={input} value={code} maxLength={4} inputMode="numeric"
                   onChange={(e)=>setCode(e.target.value.replace(/\D/g,''))}
                   placeholder="Optional e.g. 1234" />
          </label>
          <button type="submit" style={btn}>Create</button>
        </form>
      </div>
    </main>
  );
}
const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
const h1: React.CSSProperties = { margin:"48px 0 16px" };
const label: React.CSSProperties = { display:"grid", gap:6, fontSize:14, opacity:.9 };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
const btn: React.CSSProperties = { padding:"12px 16px", borderRadius:12, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, marginTop:8 };
