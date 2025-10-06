"use client";

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

    // compute position (joined order)
    const joined = memberships
      .filter((m) => m.queueId === id)
      .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
    const myJoin = joined.findIndex((m) => m.queueId === id);
    setPosition(myJoin >= 0 ? myJoin + 1 : null);
  }, [id]);

  const leaveQueue = () => {
    const memberships = load<QueueMembership[]>("queueMemberships", []);
    const next = memberships.filter((m) => m.queueId !== id);
    save("queueMemberships", next);
    alert("You left the queue!");
    router.push("/"); // go back home
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
        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            background: "transparent",
            border: "none",
            color: "#0ea5e9",
            fontWeight: 600,
            marginBottom: 12,
            cursor: "pointer",
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
            padding: 16,
            border: "1px solid rgba(255,255,255,.12)",
          }}
        >
          {position ? (
            <>
              <div style={{ fontSize: 18 }}>
                You are <b>#{position}</b> in line
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
                Stay on this page to keep your spot
              </div>
            </>
          ) : (
            <div>You are not currently joined in this queue.</div>
          )}
        </div>

        <button
          onClick={leaveQueue}
          style={{
            marginTop: 24,
            padding: "12px 18px",
            borderRadius: 12,
            border: "none",
            background: "#dc2626",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Leave Queue
        </button>
      </div>
    </main>
  );
}
