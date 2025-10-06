"use client";

import Link from "next/link";

type Format = "Single Elim" | "Double Elim" | "Round Robin";

type Tournament = {
  id: string;
  name: string;
  venue: string;
  format: Format;
  startsAt?: string;   // ISO string
  players?: string[];  // optional for older records
  createdAt?: string;  // optional for older records
};

type Membership = {
  tournamentId: string;
  playerName: string;
  joinedAt: string; // ISO
};

function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function YourTournaments() {
  const tournaments = load<Tournament[]>("tournaments", []);
  const memberships = load<Membership[]>("memberships", []);

  const joinedIds = new Set(memberships.map((m) => m.tournamentId));
  const joined = tournaments.filter((t) => joinedIds.has(t.id));

  if (!joined.length) return null;

  return (
    <div style={{ width: "min(720px, 92%)", marginTop: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Your Tournaments</div>
      <div style={{ display: "grid", gap: 8 }}>
        {joined.map((t) => (
          <Link
            key={t.id}
            href={`/tournaments/${t.id}`}
            style={{
              textDecoration: "none",
              color: "white",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.04)",
            }}
          >
            <div style={{ fontWeight: 700 }}>{t.name}</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>
              {t.venue} • {t.format} • {t.startsAt ?? "TBD"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
