// src/app/t/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getDeviceId } from "@/lib/device";
import type { Format } from "@/types";

/** Local cache shape just for client-side lists */
type LocalTournament = {
  id: string;
  code: string;
  name: string;
  venue?: string;
  format: Format;
  startsAt?: string; // ISO or undefined
  players: string[]; // names only for local overview
  createdAt: number; // <-- keep as number
  hostName?: string;
  hostDeviceId?: string;
};

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

export default function NewTournamentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<Format>("Single Elim");
  const [creatorName, setCreatorName] = useState("");

  async function onCreate() {
    const id = crypto.randomUUID();
    const startsAt = date && time ? `${date}T${time}` : undefined;

    // random 4-char code (server will enforce uniqueness; may replace this if conflict)
    const proposedCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    const createdAt = Date.now();

    // Build the payload to your CF function
    const payload = {
      id,
      name: name.trim() || "Untitled Tournament",
      code: proposedCode,
      hostId: getDeviceId(), // we use deviceId as "user id" for now
      hostName: creatorName.trim() || undefined,
      createdAt, // number
      venue: venue.trim() || "TBD",
      format,
      startsAt, // ISO or undefined
    };

    // Create on server (functions/api/tournaments/index.ts)
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      alert(`Failed to create tournament.\n${text || res.status}`);
      return;
    }

    // Server may adjust code (to ensure global uniqueness)
    const data: { id: string; code: string } = await res.json();
    const finalId = data.id || id;
    const finalCode = data.code || proposedCode;

    // ---- Local caches (optional UX niceties) ----
    // 1) stash in "tournaments" list locally as well (createdAt kept as number)
    const tournaments = load<LocalTournament[]>("tournaments", []);
    const localRec: LocalTournament = {
      id: finalId,
      code: finalCode,
      name: payload.name,
      venue: payload.venue,
      format: payload.format as Format,
      startsAt: payload.startsAt,
      players: [], // start empty; we’ll add host below if provided
      createdAt, // number
      hostName: payload.hostName,
      hostDeviceId: payload.hostId,
    };
    save<LocalTournament[]>("tournaments", [localRec, ...tournaments]);

    // 2) if creator provided a name, auto-join as player locally
    const n = creatorName.trim();
    if (n) {
      // memberships
      const memberships = load<Membership[]>("memberships", []);
      const nextMs: Membership[] = [
        ...memberships.filter((m) => m.tournamentId !== finalId),
        { tournamentId: finalId, playerName: n, joinedAt: new Date().toISOString() },
      ];
      save("memberships", nextMs);

      // reflect host name in local tournaments list
      const updatedTs = load<LocalTournament[]>("tournaments", []).map((t) =>
        t.id === finalId ? { ...t, players: Array.from(new Set([...(t.players || []), n])) } : t
      );
      save("tournaments", updatedTs);
    }

    // 3) create a Queue entry locally (so it shows under “Your Queues”)
    const queues = load<Queue[]>("queues", []);
    const queueName = `${localRec.name} Queue`;
    const nextQueues: Queue[] = [...queues.filter((q) => q.id !== finalId), { id: finalId, name: queueName }];
    save("queues", nextQueues);

    // 4) auto-join that queue locally
    const qms = load<QueueMembership[]>("queueMemberships", []);
    const nextQms: QueueMembership[] = [
      ...qms.filter((m) => m.queueId !== finalId),
      { queueId: finalId, joinedAt: new Date().toISOString() },
    ];
    save("queueMemberships", nextQms);

    alert(`Tournament Created!\nShare this code with players:\n\n${finalCode}`);

    // 5) go to bracket page (new route is /t/[id])
    router.push(`/t/${finalId}`);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Create Tournament" />
      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <label style={{ display: "block", marginBottom: 10 }}>
          Name
          <input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="Friday Night Ping Pong"
            style={input}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Venue
          <input
            value={venue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVenue(e.target.value)}
            placeholder="Kava Bar (Las Olas)"
            style={input}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              style={input}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={time}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTime(e.target.value)}
              style={input}
            />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          Format
          <select
            value={format}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormat(e.target.value as Format)}
            style={input}
          >
            <option>Single Elim</option>
            <option>Double Elim</option>
            <option>Round Robin</option>
          </select>
        </label>

        <label style={{ display: "block", margin: "12px 0" }}>
          Your name (host & auto-join)
          <input
            value={creatorName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreatorName(e.target.value)}
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
