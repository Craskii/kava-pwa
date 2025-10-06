'use client';
import { useRouter } from "next/navigation";
import { useState } from "react";
import BackButton from "../../components/BackButton";
import { findByCode, saveTournament, uid } from "../../lib/storage";

export default function JoinPage() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [noSwitch, setNoSwitch] = useState(true); // ✅ new: don't switch identity

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = findByCode(code);
    if (!t) { alert("No tournament with that code"); return; }

    const playerId = uid();
    const playerName = name || "Player";
    t.players.push({ id: playerId, name: playerName });
    t.queue.push(playerId);
    saveTournament(t);

    if (!noSwitch) {
      // normal behavior (become this player)
      localStorage.setItem("kava_me", JSON.stringify({ id: playerId, name: playerName }));
    }
    // if noSwitch === true, we DO NOT change kava_me (stay signed in as host)
    r.push(`/t/${t.id}`);
  }

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width:"100%", maxWidth:420 }}>
        <h1 style={h1}>Join with Code</h1>
        <form onSubmit={onSubmit} style={{ display:"grid", gap:12 }}>
          <input
            style={input}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            style={input}
            placeholder="4-digit code"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />

          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, opacity:.9 }}>
            <input
              type="checkbox"
              checked={noSwitch}
              onChange={(e) => setNoSwitch(e.target.checked)}
            />
            Join without switching my identity (testing mode)
          </label>

          <button type="submit" style={btnPrimary}>Join</button>
        </form>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
const h1: React.CSSProperties = { margin:"48px 0 16px" };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
const btnPrimary: React.CSSProperties = { padding:"12px 16px", borderRadius:12, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700 };
