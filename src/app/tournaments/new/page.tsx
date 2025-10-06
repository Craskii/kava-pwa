"use client";
import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { save, load } from "@/lib/storage";

type NewTournament = {
  name: string;
  venue: string;
  date: string; // ISO date
  time: string; // HH:mm
  format: "Single Elim" | "Double Elim" | "Round Robin";
};

export default function NewTournamentPage() {
  const [form, setForm] = useState<NewTournament>(
    load<NewTournament>("draft_tournament", {
      name: "",
      venue: "",
      date: "",
      time: "",
      format: "Single Elim",
    })
  );
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof NewTournament>(k: K, v: NewTournament[K]) => {
    const next = { ...form, [k]: v };
    setForm(next);
    save("draft_tournament", next);
    setSaved(false);
  };

  const submit = () => {
    // For now, just save locally and show a “created” state.
    const created = load<any[]>("tournaments", []);
    const id = crypto.randomUUID();
    const startsAt = form.date && form.time ? `${form.date}T${form.time}` : "";
    const rec = { id, ...form, startsAt };
    const next = [rec, ...created];
    save("tournaments", next);
    setSaved(true);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Create Tournament" />

      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 12, opacity: .85 }}>
          Quick setup (name, venue, date/time, format). This saves offline.
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          Name
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Friday Night Ping Pong"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Venue
          <input
            value={form.venue}
            onChange={(e) => update("venue", e.target.value)}
            placeholder="Kava Bar (Las Olas)"
            style={inputStyle}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={form.time}
              onChange={(e) => update("time", e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <label style={{ display: "block", margin: "12px 0" }}>
          Format
          <select
            value={form.format}
            onChange={(e) => update("format", e.target.value as NewTournament["format"])}
            style={inputStyle}
          >
            <option>Single Elim</option>
            <option>Double Elim</option>
            <option>Round Robin</option>
          </select>
        </label>

        <button onClick={submit} style={primaryBtn}>
          Create
        </button>

        {saved && (
          <div style={{ marginTop: 12, color: "#34d399" }}>
            ✅ Saved locally. (Next step: wire a backend or KV.)
          </div>
        )}

        <RecentTournaments />
      </div>
    </main>
  );
}

function RecentTournaments() {
  const items = load<any[]>("tournaments", []);
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent (local):</div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((t) => (
          <div key={t.id} style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.06)" }}>
            <div style={{ fontWeight: 700 }}>{t.name}</div>
            <div style={{ opacity: .8, fontSize: 12 }}>
              {t.venue} • {t.format} • {t.startsAt || "No date"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.06)",
  color: "white",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  marginTop: 8,
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "#0ea5e9",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
