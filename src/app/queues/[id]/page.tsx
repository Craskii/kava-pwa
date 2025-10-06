"use client";

export const runtime = "edge";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

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

function save<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export default function QueueDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [queue, setQueue] = useState<Queue | null>(null);
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    const queues = load<Queue[]>("queues", []);
    const memberships = load<QueueMembership[]>("queueMemberships", []);
    const foundQueue = queues.find((q) => q.id === id);
    setQueue(foundQueue || null);

    // Determine order among joined queues (for fun, we'll just simulate)
    const joined = memberships.filter((m) => m.queueId === id);
    const myIndex = joined.findIndex((m) => m.queueId === id);
    setPosition(myIndex >= 0 ? myIndex + 1 : 1);
  }, [id]);

  const leaveQueue = () => {
    const memberships = load<QueueMembership[]>("queueMemberships", []);
    const next = memberships.filter((m) => m.queueId !== id);
    save("queueMemberships", next);
    alert("You left the queue.");
    router.push("/"); // back to home
  };

  if (!queue) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0b1220",
          color: "white",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div>Queue not found</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        color: "white",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 720 }}>
        {/* ← Back button */}
        <button
          onClick={() => router.push("/")}
          style={{
            background: "transparent",
            border: "none",
            color: "#0ea5e9",
            fontWeight: 600,
            marginBottom: 12,
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{queue.name}</h1>
        {queue.distance && (
          <div style={{ opacity: 0.8, fontSize: 14 }}>{queue.distance}</div>
        )}

        <div
          style={{
            marginTop: 24,
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            padding: 24,
            border: "1px solid rgba(255,255,255,.12)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 8 }}>
            Your Position in Line:
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: "#0ea5e9",
              marginBottom: 4,
            }}
          >
            #{position ?? 1}
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Stay on this page to keep your spot active.
          </div>
        </div>

        {/* Leave Queue Button */}
        <button
          onClick={leaveQueue}
          style={{
            marginTop: 32,
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: "#dc2626",
            color: "white",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            width: "100%",
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
          }}
        >
          Leave Queue
        </button>
      </div>
    </main>
  );
}
