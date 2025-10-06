"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import {
  findByCodeRemote,
  saveTournamentRemote,
  type Tournament,
  type Player,
} from "@/lib/storage";
import { getDeviceId } from "@/lib/device";

export default function JoinByCodePage() {
  const r = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [testing, setTesting] = useState(true); // keep identity when testing on one phone
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return alert("Enter a code.");

    setBusy(true);
    try {
      const t = await findByCodeRemote(trimmed);
      if (!t) {
        alert("No tournament with that code");
        return;
      }

      // identity
      const deviceId = getDeviceId();
      const display = (name || "Guest").trim();
      const me: Player = { id: deviceId, name: display };

      // optionally switch identity OFF for testing on a single phone
      if (!testing) {
        localStorage.setItem("kava_me", JSON.stringify(me));
      }

      // add to pending (if not already a player/pending)
      const already =
        t.players.some(p => p.id === me.id) ||
        (t.pending || []).some(p => p.id === me.id);

      if (!already) {
        t.pending ||= [];
        t.pending.push(me);
        await saveTournamentRemote(t);
      }

      r.push(`/t/${t.id}`);
    } catch (err: any) {
      alert(err?.message || "Failed to join.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Join with Code" />
      <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Code
          <input
            autoCapitalize="characters"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="ABCD"
            style={input}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Your name
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sarah"
            style={input}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={testing}
            onChange={e => setTesting(e.target.checked)}
          />
          <span>Join without switching my identity (testing mode)</span>
        </label>

        <button onClick={submit} disabled={busy} style={primary}>
          {busy ? "Requesting…" : "Request to Join"}
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
