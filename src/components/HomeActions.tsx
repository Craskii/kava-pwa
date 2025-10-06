"use client";
import Link from "next/link";
import YourTournaments from "@/components/YourTournaments"; // 👈 ADD THIS LINE

export default function HomeActions() {
  return (
    <div style={{ width: "min(720px, 92%)", marginTop: 12 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>What do you want to do?</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <Link
          href="/tournaments/new"
          style={{
            padding: 16,
            borderRadius: 16,
            background: "#0284c7",
            color: "white",
            textDecoration: "none",
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>Create Tournament</div>
          <div style={{ opacity: 0.9, fontSize: 12 }}>Rules, brackets, invites</div>
        </Link>

        <Link
          href="/queues/join"
          style={{
            padding: 16,
            borderRadius: 16,
            background: "#059669",
            color: "white",
            textDecoration: "none",
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>Join Queue</div>
          <div style={{ opacity: 0.9, fontSize: 12 }}>Get turn alerts</div>
        </Link>

        <Link
          href="/bars"
          style={{
            gridColumn: "1 / -1",
            padding: 16,
            borderRadius: 16,
            background: "#7c3aed",
            color: "white",
            textDecoration: "none",
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>Kava Bar List</div>
          <div style={{ opacity: 0.9, fontSize: 12 }}>Nearby venues & schedules</div>
        </Link>
      </div>

      {/* 👇 ADD THIS BELOW THE GRID */}
      <YourTournaments />
    </div>
  );
}
