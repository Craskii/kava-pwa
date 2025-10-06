"use client";

import { useState } from "react";
import BackButton from "@/components/BackButton";
import { apiGet } from "@/lib/api";
import type { Tournament } from "@/types";
import { useRouter } from "next/navigation";

export default function JoinPage() {
  const r = useRouter();
  const [code, setCode] = useState("");

  async function onJoin() {
    if (!/^\d{4}$/.test(code)) { alert("Enter the 4-digit code."); return; }
    const t = await apiGet<Tournament | null>(`/api/by-code/${code}`);
    if (!t) { alert("No tournament with that code"); return; }
    r.push(`/t/${t.id}`);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <BackButton />
        <h1>Join with Code</h1>
        <label style={{ display: "block", marginBottom: 10 }}>
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="\d{4}"
            placeholder="1234"
            style={input}
          />
        </label>
        <button onClick={onJoin} style={primary}>Request to Join</button>
      </div>
    </main>
  );
}

const input: React.CSSProperties = {
  marginTop: 6, width: "100%", padding: "10px 12px",
  borderRadius: 12, border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.06)", color: "white", outline: "none",
};
const primary: React.CSSProperties = {
  marginTop: 8, padding: "12px 16px", borderRadius: 12, border: "none",
  background: "#0ea5e9", color: "white", fontWeight: 700, cursor: "pointer",
};
