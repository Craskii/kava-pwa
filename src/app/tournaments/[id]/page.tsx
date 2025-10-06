"use client";
export const runtime = "edge";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Bracket from "@/components/Bracket";
import { seedSingleElim } from "@/lib/bracket";
import { getDeviceId } from "@/lib/device";
import type { Tournament, Membership, QueueMembership } from "@/types";

function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function save<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [queueMemberships, setQueueMemberships] = useState<QueueMembership[]>([]);
  const [name, setName] = useState("");
  const deviceId = getDeviceId();

  useEffect(() => {
    setTournaments(load<Tournament[]>("tournaments", []));
    setMemberships(load<Membership[]>("memberships", []));
    setQueueMemberships(load<QueueMembership[]>("queueMemberships", []));
  }, []);

  const t = useMemo(() => tournaments.find(x => x.id === id) || null, [id, tournaments]);
  const players = t?.players ?? [];
  const isHost = !!t && t.hostDeviceId === deviceId;

  const refresh = () => {
    setTournaments(load<Tournament[]>("tournaments", []));
    setMemberships(load<Membership[]>("memberships", []));
    setQueueMemberships(load<QueueMembership[]>("queueMemberships", []));
  };

  const join = () => {
    const n = name.trim();
    if (!n || !t) return;

    // add to tournament players
    const nextTs = tournaments.map(x =>
      x.id === t.id ? { ...x, players: Array.from(new Set([...(x.players || []), n])) } : x
    );
    save("tournaments", nextTs);

    // add membership
    const nextMs: Membership[] = [
      ...memberships.filter(m => m.tournamentId !== t.id),
      { tournamentId: t.id, playerName: n, joinedAt: new Date().toISOString() },
    ];
    save("memberships", nextMs);

    // also join the queue with same id
    const nextQms: QueueMembership[] = [
      ...queueMemberships.filter(m => m.queueId !== t.id),
      { queueId: t.id, joinedAt: new Date().toISOString() },
    ];
    save("queueMemberships", nextQms);

    setName("");
    refresh();
  };

  const kick = (player: string) => {
    if (!t || !isHost) return;
    const nextTs = tournaments.map(x =>
      x.id === t.id ? { ...x, players: (x.players || []).filter(p => p !== player) } : x
    );
    save("tournaments", nextTs);
    refresh();
  };

  const addPlayer = () => {
    if (!t || !isHost) return;
    const p = name.trim();
    if (!p) return;
    const nextTs = tournaments.map(x =>
      x.id === t.id ? { ...x, players: Array.from(new Set([...(x.players || []), p])) } : x
    );
    save("tournaments", nextTs);
    setName("");
    refresh();
  };

  if (!t) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b1220", color: "white", display:"grid", placeItems:"center" }}>
        Not found
      </main>
    );
  }

  const rounds = seedSingleElim(players);

  return (
    <main style={{ minHeight:"100vh", background:"#0b1220", color:"white" }}>
      <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
        {/* Back to Home */}
        <button
          onClick={() => router.push("/")}
          style={{ background:"transparent", border:"none", color:"#0ea5e9", fontWeight:600, cursor:"pointer", marginBottom:12 }}
        >← Back</button>

        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{t.name}</h1>
        <div style={{ opacity:.8, fontSize: 13, marginBottom: 12 }}>
          {t.venue} • {t.format} • {t.startsAt ?? "TBD"}
          {isHost && <span style={{ marginLeft: 8, color:"#34d399" }}>• You are host</span>}
        </div>

        {/* Join / Manage */}
        <div style={{ display:"grid", gap: 12, marginBottom: 12 }}>
          {!isHost && (
            <div style={{ display:"flex", gap:8 }}>
              <input value={name} onChange={e => setName(e.target.value)}
                     placeholder="Your player name" style={input} />
              <button onClick={join} style={primary}>Join</button>
            </div>
          )}
          {isHost && (
            <div style={{ display:"flex", gap:8 }}>
              <input value={name} onChange={e => setName(e.target.value)}
                     placeholder="Add player name" style={input} />
              <button onClick={addPlayer} style={primary}>Add</button>
            </div>
          )}
        </div>

        {/* Players list (host can kick) */}
        <h3 style={{ marginTop: 8, marginBottom: 6 }}>Players ({players.length})</h3>
        <div style={{ display:"grid", gap:8 }}>
          {players.map(p => (
            <div key={p} style={row}>
              <span>{p}</span>
              {isHost && (
                <button onClick={() => kick(p)} style={dangerMini}>Kick</button>
              )}
            </div>
          ))}
          {!players.length && <div style={{ opacity:.8 }}>No players yet.</div>}
        </div>

        {/* Bracket */}
        <h3 style={{ marginTop: 20, marginBottom: 8 }}>Bracket</h3>
        <Bracket rounds={rounds} />
      </div>
    </main>
  );
}

const input: React.CSSProperties = {
  flex:1, padding:"10px 12px", borderRadius:12,
  border:"1px solid rgba(255,255,255,.15)",
  background:"rgba(255,255,255,.06)", color:"white"
};
const primary: React.CSSProperties = {
  padding:"10px 14px", borderRadius:12, border:"none",
  background:"#0ea5e9", color:"white", fontWeight:700, cursor:"pointer"
};
const dangerMini: React.CSSProperties = {
  padding:"6px 10px", borderRadius:10, border:"none",
  background:"#dc2626", color:"white", fontWeight:700, cursor:"pointer"
};
const row: React.CSSProperties = {
  display:"flex", alignItems:"center", justifyContent:"space-between",
  padding:"10px 12px", borderRadius:12,
  background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)"
};
