"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getDeviceId } from "@/lib/device";
import type {
  Tournament,
  Membership,
  Queue,
  QueueMembership,
  Format,
} from "@/types";

/* ---------------- localStorage helpers ---------------- */
function save<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}
function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/* ---------------- page ---------------- */
export default function NewTournamentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<Format>("Single Elim");
  const [creatorName, setCreatorName] = useState("");

  // fully typed handlers (no `any`)
  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setName(e.target.value);
  const onVenueChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setVenue(e.target.value);
  const onDateChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setDate(e.target.value);
  const onTimeChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setTime(e.target.value);
  const onFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFormat(e.target.value as Format);
  const onCreatorChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setCreatorName(e.target.value);

  const onCreate = () => {
    const id = crypto.randomUUID();
    const startsAt = date && time ? `${date}T${time}` : undefined;

    // 4-digit numeric code, e.g. "4832"
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    const tournaments = load<Tournament[]>("tournaments", []);

    const rec: Tournament = {
      id,
      code,
      name: name.trim() || "Untitled Tournament",
      venue: venue.trim() || "TBD",
      format,
      startsAt,
      players: [],
      createdAt: Date.now(), // number (keep it that way)
      hostName: creatorName.trim() || undefined,
      hostDeviceId: getDeviceId(),
    };

    let nextTs = [rec, ...tournaments];

    // Auto-join host if they provided a name
    const n = creatorName.trim();
    if (n) {
      nextTs = nextTs.map((t) =>
        t.id === id
          ? { ...t, players: Array.from(new Set([...(t.players || []), n])) }
          : t
      );
      const memberships = load<Membership[]>("memberships", []);
      const nextMs: Membership[] = [
        ...memberships.filter((m) => m.tournamentId !== id),
        { tournamentId: id, playerName: n, joinedAt: new Date().toISOString() },
      ];
      save("memberships", nextMs);
    }

    save("tournaments", nextTs);

    // Create a local Queue entry so it appears under "Your Queues"
    const queues = load<Queue[]>("queues", []);
    const queueName = `${rec.name} Queue`;
    const nextQueues: Queue[] = [
      ...queues.filter((q) => q.id !== id),
      { id, name: queueName },
    ];
    save("queues", nextQueues);

    // Auto-join the queue locally
    const qms = load<QueueMembership[]>("queueMemberships", []);
    const nextQms: QueueMembership[] = [
      ...qms.filter((m) => m.queueId !== id),
      { queueId: id, joinedAt: new Date().toISOString() },
    ];
    save("queueMemberships", nextQms);

    alert(`✅ Tournament Created!\nShare this 4-digit code:\n\n${code}`);

    router.push(`/t/${id}`);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Create Tournament" />
      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <label style={{ display: "block", marginBottom: 10 }}>
          Name
          <input
            value={name}
            onChange={onNameChange}
            placeholder="Friday Night Ping Pong"
            style={input}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Venue
          <input
            value={venue}
            onChange={onVenueChange}
            placeholder="Kava Bar (Las Olas)"
            style={input}
          />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <label>
            Date
            <input type="date" value={date} onChange={onDateChange} style={input} />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={onTimeChange} style={input} />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          Format
          <select value={format} onChange={onFormatChange} style={input}>
            <option>Single Elim</option>
            <option>Double Elim</option>
            <option>Round Robin</option>
          </select>
        </label>

        <label style={{ display: "block", margin: "12px 0" }}>
          Your name (host & auto-join)
          <input
            value={creatorName}
            onChange={onCreatorChange}
            placeholder="e.g. Henry"
            style={input}
          />
        </label>

        <button onClick={onCreate} style={primary}>
          Create & View Bracket
        </button>
      </div>
    </main>
  );
}

/* ---------------- styles ---------------- */
const input: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.06)",
  color: "white",
  outline: "none",
};
const primary: React.CSSProperties = {
  marginTop: 8,
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "#0ea5e9",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
