"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getDeviceId } from "@/lib/device";
import type { Format, Tournament, Membership, Queue, QueueMembership } from "@/types";
import { apiPost } from "@/lib/api";

// localStorage helpers
function save<T>(k: string, v: T) { if (typeof localStorage !== "undefined") localStorage.setItem(k, JSON.stringify(v)); }
function load<T>(k: string, fb: T): T {
  if (typeof localStorage === "undefined") return fb;
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
}

export default function NewTournamentPage() {
  const r = useRouter();

  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<Format>("Single Elim");
  const [creatorName, setCreatorName] = useState("");

  async function onCreate() {
    const id = crypto.randomUUID();
    const startsAt = date && time ? `${date}T${time}` : undefined;
    const code = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits

    const rec: Tournament = {
      id,
      code,
      name: name.trim() || "Untitled Tournament",
      venue: venue.trim() || "TBD",
      format,
      startsAt,
      players: [],
      createdAt: Date.now(),
      hostName: creatorName.trim() || undefined,
      hostDeviceId: getDeviceId(),
    };

    // Save to server (KV)
    const created = await apiPost<Tournament>("/api/tournaments", rec);
    if ((created as any)?.error) {
      alert((created as any).error);
      return;
    }

    // Mirror locally so host can see it offline too
    const tournaments = load<Tournament[]>("tournaments", []);
    save("tournaments", [created, ...tournaments]);

    // Optional local “Your queues” UX
    const queues = load<Queue[]>("queues", []);
    const qName = `${created.name} Queue`;
    save<Queue[]>("queues", [...queues.filter(q => q.id !== created.id), { id: created.id, name: qName }]);

    if (creatorName.trim()) {
      const ms = load<Membership[]>("memberships", []);
      save<Membership[]>("memberships", [
        ...ms.filter(m => m.tournamentId !== created.id),
        { tournamentId: created.id, playerName: creatorName.trim(), joinedAt: new Date().toISOString() },
      ]);
      const qms = load<QueueMembership[]>("queueMemberships", []);
      save<QueueMembership[]>("queueMemberships", [
        ...qms.filter(m => m.queueId !== created.id),
        { queueId: created.id, joinedAt: new Date().toISOString() },
      ]);
    }

    alert(`✅ Tournament Created!\nShare this code with players:\n\n${created.code}`);
    r.push(`/t/${created.id}`);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Create Tournament" />
      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <label style={{ display: "block", marginBottom: 10 }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Ping Pong" style={input} />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Venue
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Kava Bar (Las Olas)" style={input} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <label> Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
          </label>
          <label> Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} style={input}>
            <option>Single Elim</option>
            <option>Double Elim</option>
            <option>Round Robin</option>
          </select>
        </label>

        <label style={{ display: "block", margin: "12px 0" }}>
          Your name (host & auto-join)
          <input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="e.g. Henry" style={input} />
        </label>

        <button onClick={onCreate} style={primary}>Create & View Bracket</button>
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
