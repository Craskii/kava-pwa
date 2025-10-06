"use client";
import { useState } from "react";
import AppHeader from "@/components/AppHeader";

const MOCK_NEARBY = [
  { id: "abc123", name: "Las Olas Friday Queue", distance: "0.3 mi" },
  { id: "def456", name: "Miami Beach Saturday Queue", distance: "2.1 mi" },
];

export default function JoinQueuePage() {
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState<string | null>(null);

  const joinByCode = () => {
    if (!code.trim()) return;
    setJoined(code.trim());
  };

  const joinItem = (id: string) => {
    setJoined(id);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Join Queue" />

      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        {!joined ? (
          <>
            <div style={{ marginBottom: 12 }}>Enter a code or pick a nearby queue.</div>

            <label style={{ display: "block", marginBottom: 12 }}>
              Code
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. ABC123"
                  style={input}
                />
                <button onClick={joinByCode} style={btn}>Join</button>
              </div>
            </label>

            <div style={{ marginTop: 16, fontWeight: 700 }}>Nearby</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {MOCK_NEARBY.map((q) => (
                <button
                  key={q.id}
                  onClick={() => joinItem(q.id)}
                  style={card}
                >
                  <div style={{ fontWeight: 700 }}>{q.name}</div>
                  <div style={{ opacity: .8, fontSize: 12 }}>{q.distance}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.06)" }}>
            <div style={{ fontWeight: 700 }}>Joined queue</div>
            <div style={{ opacity: .85, fontSize: 12 }}>ID/Code: {joined}</div>
            <div style={{ marginTop: 8, fontSize: 14 }}>
              You’ll get turn alerts here. (Next: hook push notifications.)
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const input: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.06)",
  color: "white",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "#0ea5e9",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const card: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.04)",
  color: "white",
} as const;
