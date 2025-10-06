'use client';

import { useState } from "react";
import BackButton from "../../components/BackButton"; // ✅ relative path

export default function JoinPage() {
  const [code, setCode] = useState("");

  return (
    <main style={wrap}>
      <h1 style={h1}>Join with code</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); alert(`Joining code ${code}`); }}
        style={{ display: "grid", gap: 12, width: "100%", maxWidth: 420 }}
      >
        <input
          style={input}
          placeholder="4-digit code"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <button style={btn}>Join</button>
      </form>
    </main>
  );
}
const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
const h1: React.CSSProperties = { marginTop:0, marginBottom:16 };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
const btn: React.CSSProperties = { padding:"12px 16px", borderRadius:12, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700 };
