"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import {
  uid,
  type Tournament,
  type Player,
  isCodeInUseRemote,
  createTournamentRemote,
} from "@/lib/storage";
import { getDeviceId } from "@/lib/device";

/* Local-only “Your Queues” artifacts to keep your existing widgets happy */
type Membership = { tournamentId: string; playerName: string; joinedAt: string };
type Queue = { id: string; name: string };
type QueueMembership = { queueId: string; joinedAt: string };

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

type Format = "Single Elim" | "Double Elim" | "Round Robin";

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const taken = await isCodeInUseRemote(code);
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique code. Please try again.");
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<Format>("Single Elim");
  const [creatorName, setCreatorName] = useState(""); // host player name (optional)
  const [busy, setBusy] = useState(false);

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
  const onVenueChange = (e: React.ChangeEvent<HTMLInputElement>) => setVenue(e.target.value);
  const onDateChange = (e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value);
  const onTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => setTime(e.target.value);
  const onFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => setFormat(e.target.value as Format);
  const onCreatorNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setCreatorName(e.target.value);

  const onCreate = async () => {
    try {
      setBusy(true);

      // Host identity
      const deviceId = getDeviceId();
      const hostName = (creatorName || "Host").trim();
      const me: Player = { id: deviceId, name: hostName };

      // Unique code on server
      const code = await generateUniqueCode();

      const id = uid();
      const createdAt = Date.now();
      const startsAt = date && time ? `${date}T${time}` : undefined;

      const rec: Tournament = {
        id,
        code,
        name: name.trim() || "Untitled Tournament",
        hostId: deviceId,
        status: "setup",
        createdAt,
        players: [me],     // host is approved
        pending: [],
        queue: [],
        rounds: [],
        // @ts-expect-error optional UI-only metadata (not used by server)
        meta: { venue: venue.trim() || "TBD", startsAt, format },
      };

      // Create on server (KV) so other phones see it
      await createTournamentRemote(rec);

      // Keep your local “Your Queues” features working
      type LocalTournament = Tournament & { createdAt: number | string };
      const tournaments = load<LocalTournament[]>("tournaments", []);
      save<LocalTournament[]>("tournaments", [
        { ...rec, createdAt: new Date(createdAt).toISOString() },
        ...tournaments,
      ]);

      const memberships = load<Membership[]>("memberships", []);
      save<Membership[]>("memberships", [
        ...memberships.filter(m => m.tournamentId !== id),
        { tournamentId: id, playerName: me.name, joinedAt: new Date().toISOString() },
      ]);

      const queues = load<Queue[]>("queues", []);
      const queueName = `${rec.name} Queue`;
      save<Queue[]>("queues", [...queues.filter(q => q.id !== id), { id, name: queueName }]);

      const qms = load<QueueMembership[]>("queueMemberships", []);
      save<QueueMembership[]>("queueMemberships", [
        ...qms.filter(m => m.queueId !== id),
        { queueId: id, joinedAt: new Date().toISOString() },
      ]);

      alert(`Tournament Created!\nShare this code with players:\n\n${code}`);
      router.push(`/t/${id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create tournament.";
      alert(msg);
    } finally {
      setBusy(false);
    }
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
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
            onChange={onCreatorNameChange}
            placeholder="e.g. Henry"
            style={input}
          />
        </label>

        <button onClick={onCreate} disabled={busy} style={primary}>
          {busy ? "Creating…" : "Create & View Bracket"}
        </button>
      </div>
    </main>
  );
}

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
