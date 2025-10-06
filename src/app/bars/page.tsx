"use client";
import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";

const MOCK_BARS = [
  { id: "kava1", name: "Kava Las Olas", city: "Fort Lauderdale", hours: "12–2am" },
  { id: "kava2", name: "Kava Wynwood", city: "Miami", hours: "12–3am" },
  { id: "kava3", name: "Kava Boca", city: "Boca Raton", hours: "1–1am" },
];

export default function BarsPage() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return MOCK_BARS;
    const t = q.toLowerCase();
    return MOCK_BARS.filter(
      b => b.name.toLowerCase().includes(t) || b.city.toLowerCase().includes(t)
    );
  }, [q]);

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Kava Bar List" />

      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search bars or city…"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.06)",
            color: "white",
          }}
        />

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {filtered.map((b) => (
            <div
              key={b.id}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(255,255,255,.04)",
              }}
            >
              <div style={{ fontWeight: 700 }}>{b.name}</div>
              <div style={{ opacity: .8, fontSize: 12 }}>{b.city} • {b.hours}</div>
            </div>
          ))}
          {!filtered.length && (
            <div style={{ opacity: .8, padding: 12 }}>No results.</div>
          )}
        </div>
      </div>
    </main>
  );
}
