"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getDeviceId } from "@/lib/device";
import type { Tournament, Membership, Queue, QueueMembership, Format } from "@/types";

function save<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}
function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<Format>("Single Elim");
  const [creatorName, setCreatorName] = useState(""); // host player name (optional)

  const onCreate = () => {
  const id = crypto.randomUUID();
  const startsAt = date && time ? `${date}T${time}` : undefined;

  // 👇 generate a random 4-character code
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();

  const tournaments = load<Tournament[]>("tournaments", []);
  const rec: Tournament = {
    id,
    code, // 👈 add code here
    name: name.trim() || "Untitled Tournament",
    venue: venue.trim() || "TBD",
    format,
    startsAt,
    players: [],
    createdAt: new Date().toISOString(),
    hostName: creatorName.trim() || undefined,
    hostDeviceId: getDeviceId(),
  };

    let nextTs = [rec, ...tournaments];

    // 2) if creator provided a name, auto-join as player
    const n = creatorName.trim();
    if (n) {
      nextTs = nextTs.map(t => t.id === id ? { ...t, players: Array.from(new Set([...(t.players || []), n])) } : t);
      const memberships = load<Membership[]>("memberships", []);
      const nextMs: Membership[] = [
        ...memberships.filter(m => m.tournamentId !== id),
        { tournamentId: id, playerName: n, joinedAt: new Date().toISOString() },
      ];
      save("memberships", nextMs);
    }
    save("tournaments", nextTs);

    // 3) create a Queue entry for this tournament (so it shows under Your Queues)
    const queues = load<Queue[]>("queues", []);
    const queueName = `${rec.name} Queue`;
    const nextQueues: Queue[] = [...queues.filter(q => q.id !== id), { id, name: queueName }];
    save("queues", nextQueues);

    // 4) auto-join its queue as well
    const qms = load<QueueMembership[]>("queueMemberships", []);
    const nextQms: QueueMembership[] = [
      ...qms.filter(m => m.queueId !== id),
      { queueId: id, joinedAt: new Date().toISOString() },
    ];
    save("queueMemberships", nextQms);

    alert(`Tournament Created!\nShare this code with players:\n\n${code}`);

    // 5) go to bracket page
    router.push(`/tournaments/${id}`);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Create Tournament" />
      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <label style={{ display: "block", marginBottom: 10 }}>
          Name
          <input value={name} onChange={e => setName(e.target.value)}
                 placeholder="Friday Night Ping Pong" style={input} />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Venue
          <input value={venue} onChange={e => setVenue(e.target.value)}
                 placeholder="Kava Bar (Las Olas)" style={input} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <label> Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input}/>
          </label>
          <label> Time
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={input}/>
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          Format
          <select value={format} onChange={e => setFormat(e.target.value as Format)} style={input}>
            <option>Single Elim</option>
            <option>Double Elim</option>
            <option>Round Robin</option>
          </select>
        </label>

        <label style={{ display: "block", margin: "12px 0" }}>
          Your name (host & auto-join)
          <input value={creatorName} onChange={e => setCreatorName(e.target.value)}
                 placeholder="e.g. Henry" style={input}/>
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
