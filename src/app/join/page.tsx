'use client';

import { useState } from "react";
import BackButton from "../../components/BackButton"; // ✅ relative path

export default function JoinPage() {
  const [code, setCode] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    alert(`Joining tournament with code: ${code}`);
    // later: validate code + navigate to lobby
  }

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width:"100%", maxWidth:420 }}>
        <h1 style={h1}>Join with Code</h1>
        <form onSubmit={onSubmit} style={{ display:"grid", gap:12 }}>
          <input
            style={input}
            placeholder="4-digit code"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button type="submit" style={btnPrimary}>Join</button>
        </form>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
const h1: React.CSSProperties = { margin: "48px 0 16px" };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
const btnPrimary: React.CSSProperties = { padding:"12px 16px", borderRadius:12, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700 };
