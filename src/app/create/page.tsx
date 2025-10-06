'use client';

import { useState } from "react";
import BackButton from "../../components/BackButton"; // ✅ relative path

export default function CreatePage() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Placeholder: later we’ll save to DB and navigate
    alert(`Created tournament:\n• Name: ${name || "(untitled)"}\n• Code: ${code || "public"}`);
  }

  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={h1}>Create Tournament</h1>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={label}>
            Name
            <input
              style={input}
              placeholder="e.g. Friday Night Bracket"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label style={label}>
            Private? (4-digit code)
            <input
              style={input}
              placeholder="Optional code, e.g. 1234"
              inputMode="numeric"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>

          <button type="submit" style={btnPrimary}>Create</button>
        </form>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
const h1: React.CSSProperties = { margin: "48px 0 16px" };
const label: React.CSSProperties = { display:"grid", gap:6, fontSize:14, opacity:.9 };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff" };
const btnPrimary: React.CSSProperties = { padding:"12px 16px", borderRadius:12, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, marginTop:8 };
