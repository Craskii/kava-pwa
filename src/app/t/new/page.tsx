// src/app/t/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getDeviceId } from "@/lib/device";
import type { Tournament, Membership, Queue, QueueMembership, Format } from "@/types";

// --- localStorage helpers ---
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

// generate numeric 4-digit code
function genCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Try to register tournament code on the server (Cloudflare Pages Functions).
// Returns the (possibly updated) { id, code } or throws on fatal error.
// If the endpoint doesn't exist yet, we swallow the error upstream and keep local.
async function registerRemote(id: string, code: string, name: string) {
  const res = await fetch("/api/tournaments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, code, name }),
  });

  if (res.status === 409) {
    // code already taken
    const data = await res.json().catch(() => ({}));
    const newCode = data?.suggestion || genCode();
    throw Object.assign(new Error("conflict"), { code: "CONFLICT", suggestion: newCode });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`server error ${res.status}: ${txt}`);
  }

  const data = (await res.json()) as { ok: true; id: string; code: string };
  return data;
}

// --- main component ---
export default function NewTournamentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [format, setFormat] = useState<Format>("Single Elim");
  const [creatorName, setCreatorName] = useState("");
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    if (saving) return;
    setSaving(true);

    const id = crypto.randomUUID();
    const startsAt = date && time ? `${date}T${time}` : undefined;

    let code = genCode();
    const tournaments = load<Tournament[]>("tournaments", []);

    // base record for local storage
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

    // Try to register the code remotely (if your Cloudflare function is set up)
    // Loop a few times to dodge rare collisions.
    try {
      for (let tries = 0; tries < 4; tries++) {
        try {
          const r = await registerRemote(rec.id, code, rec.name);
          // success – server now owns the mapping code -> id
          code = r.code; // keep whatever the server returned
          rec.code = r.code;
          break;
        } catch (e: any) {
          if (e?.code === "CONFLICT") {
            code = e.suggestion || genCode();
            rec.code = code;
            continue; // try again with the suggestion
          }
          throw e;
        }
      }
    } catch {
      // If server is missing or failed, we silently continue with local-only create.
      // Users on the same device can still see it; cross-device will work once the
      // Cloudflare function is bound/deployed.
    }

    // Save locally (so the creator always sees it instantly)
    let nextTs = [rec, ...tournaments];

    // auto-join host if name provided
    const n = creatorName.trim();
    if (n) {
      nextTs = nextTs.map(t =>
        t.id === id ? { ...t, players: Array.from(new Set([...(t.players || []), n])) } : t
      );
      const memberships = load<Membership[]>("memberships", []);
      const nextMs: Membership[] = [
        ...memberships.filter(m => m.tournamentId !== id),
        { tournamentId: id, playerName: n, joinedAt: new Date().toISOString() },
      ];
      save("memberships", nextMs);
    }

    save("tournaments", nextTs);

    // create a Queue entry for local UI
    const queues = load<Queue[]>("queues", []);
    const queueName = `${rec.name} Queue`;
    const nextQueues: Queue[] = [
      ...queues.filter(q => q.id !== id),
      { id, name: queueName },
    ];
    save("queues", nextQueues);

    // auto-join the queue locally
    const qms = load<QueueMembership[]>("queueMemberships", []);
    const nextQms: QueueMembership[] = [
      ...qms.filter(m => m.queueId !== id),
      { queueId: id, joinedAt: new Date().toISOString() },
    ];
    save("queueMemberships", nextQms);

    alert(`✅ Tournament Created!\nShare this 4-digit code:\n\n${code}`);
    setSaving(false);
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
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday Night Ping Pong"
            style={input}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          Venue
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={input}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={input}
            />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
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
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="e.g. Henry"
            style={input}
          />
        </label>

        <button onClick={onCreate} style={primary} disabled={saving}>
          {saving ? "Creating…" : "Create & View Bracket"}
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
