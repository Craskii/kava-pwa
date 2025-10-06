"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import type { Tournament } from "@/types"; // 👈 make sure you have the Tournament type

type Queue = { id: string; name: string; distance?: string };
type QueueMembership = { queueId: string; joinedAt: string };

const MOCK_NEARBY: Queue[] = [
  { id: "abc123", name: "Las Olas Friday Queue", distance: "0.3 mi" },
  { id: "def456", name: "Miami Beach Saturday Queue", distance: "2.1 mi" },
];

function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export default function JoinQueuePage() {
  const [code, setCode] = useState("");

  const addQueue = (queue: Queue) => {
    const queues = load<Queue[]>("queues", []);
    const next = [...queues.filter((q) => q.id !== queue.id), queue];
    save("queues", next);
  };

  const addMembership = (queueId: string) => {
    const memberships = load<QueueMembership[]>("queueMemberships", []);
    const next = [
      ...memberships.filter((m) => m.queueId !== queueId),
      { queueId, joinedAt: new Date().toISOString() },
    ];
    save("queueMemberships", next);
  };

  // 👇 UPDATED joinByCode()
  const joinByCode = () => {
    const entered = code.trim().toUpperCase();
    if (!entered) return;

    // Try to find a tournament with that code
    const tournaments = load<Tournament[]>("tournaments", []);
    const found = tournaments.find((t) => t.code === entered);

    if (found) {
      // Join the queue linked to this tournament
      const queue: Queue = { id: found.id, name: `${found.name} Queue` };
      addQueue(queue);
      addMembership(found.id);
      alert(`Joined tournament queue: ${found.name}!`);
      setCode("");
      return;
    }

    // Fallback: just make a normal queue
    const queue = { id: entered, name: `Queue ${entered}` };
    addQueue(queue);
    addMembership(entered);
    alert(`Joined ${queue.name}!`);
    setCode("");
  };

  const joinQuick = (queue: Queue) => {
    addQueue(queue);
    addMembership(queue.id);
    alert(`Joined ${queue.name}!`);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Join Queue" />
      <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 12, opacity: 0.85 }}>
          Enter a code or tap a nearby queue to join.
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          Code
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. AB12"
              style={input}
            />
            <button onClick={joinByCode} style={button}>
              Join
            </button>
          </div>
        </label>

        <div style={{ marginTop: 16, fontWeight: 700 }}>Nearby</div>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {MOCK_NEARBY.map((q) => (
            <button key={q.id} onClick={() => joinQuick(q)} style={card}>
              <div style={{ fontWeight: 700 }}>{q.name}</div>
              <div style={{ opacity: 0.8, fontSize: 12 }}>{q.distance}</div>
            </button>
          ))}
        </div>
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
const button: React.CSSProperties = {
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
