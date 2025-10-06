"use client";

import Link from "next/link";

type Queue = { id: string; name: string; distance?: string };
type QueueMembership = { queueId: string; joinedAt: string };

function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function YourQueues() {
  const queues = load<Queue[]>("queues", []);
  const memberships = load<QueueMembership[]>("queueMemberships", []);
  const joinedIds = new Set(memberships.map((m) => m.queueId));
  const joined = queues.filter((q) => joinedIds.has(q.id));

  if (!joined.length) return null;

  return (
    <div style={{ width: "min(720px, 92%)", marginTop: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Your Queues</div>
      <div style={{ display: "grid", gap: 8 }}>
        {joined.map((q) => (
          <Link
            key={q.id}
            href={`/queues/${q.id}`}
            style={{
              textDecoration: "none",
              color: "white",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.04)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{q.name}</div>
            {q.distance && (
              <div style={{ opacity: 0.8, fontSize: 12 }}>{q.distance}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
