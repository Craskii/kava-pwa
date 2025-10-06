"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinByCodePage() {
  const r = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onJoin() {
    const c = code.replace(/\D/g, ""); // keep digits only
    if (c.length !== 4) {
      setMsg("Enter a 4-digit code.");
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      // ask the server to translate code -> tournamentId
      const res = await fetch(`/api/by-code/${c}`);
      if (!res.ok) {
        setMsg("Could not reach server.");
        return;
      }
      const data = (await res.json()) as { id: string } | null;
      if (!data || !data.id) {
        setMsg("No tournament with that code.");
        return;
      }

      // ✅ IMPORTANT: navigate with the **ID**, not the code
      r.push(`/t/${data.id}`);
    } catch (e) {
      setMsg("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Join with Code</h1>

      <label style={{ display: "block", marginBottom: 10 }}>
        4-digit code
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={code}
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 4);
            setCode(digitsOnly);
          }}
          placeholder="1234"
          style={{
            marginTop: 6,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.06)",
            color: "white",
            outline: "none",
            fontSize: 20,
            letterSpacing: 2,
          }}
        />
      </label>

      <button
        onClick={onJoin}
        disabled={loading || code.length !== 4}
        style={{
          marginTop: 8,
          padding: "12px 16px",
          borderRadius: 12,
          border: "none",
          background: loading || code.length !== 4 ? "#0ea5e980" : "#0ea5e9",
          color: "white",
          fontWeight: 700,
          cursor: loading || code.length !== 4 ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {loading ? "Checking..." : "Join"}
      </button>

      {msg && <p style={{ marginTop: 10, color: "#fca5a5" }}>{msg}</p>}
    </main>
  );
}
