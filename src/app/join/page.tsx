'use client';
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import BackButton from "../../components/BackButton";
import { findByCodeRemote, getTournamentRemote, saveTournamentRemote, uid } from "../../lib/storage";

export default function Join() {
  const r = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("kava_me") || "null"); } catch { return null; }
  }, []);

  async function submit() {
    setErr(null);
    try {
      const id = await findByCodeRemote(code.trim());
      if (!id) { setErr("No tournament with that code."); return; }
      const t = await getTournamentRemote(id);
      if (!t) { setErr("Could not load tournament."); return; }

      // ensure I have an identity
      let meObj = me;
      if (!meObj) {
        meObj = { id: uid(), name: "Guest" };
        localStorage.setItem("kava_me", JSON.stringify(meObj));
      }
      // add to pending if not present anywhere
      if (!t.players.some(p => p.id === meObj!.id) &&
          !t.pending.some(p => p.id === meObj!.id)) {
        t.pending.push({ id: meObj!.id, name: meObj!.name });
        await saveTournamentRemote(t);
      }

      r.push(`/t/${id}`);
    } catch {
      setErr("Could not reach server.");
    }
  }

  return (
    <main style={{ padding:24 }}>
      <BackButton />
      <h1>Join with Code</h1>
      <input
        value={code}
        onChange={e=>setCode(e.target.value)}
        placeholder="4-digit code"
        style={{ padding:10, background:"#111", color:"#fff", border:"1px solid #333", borderRadius:8 }}
      />
      <div style={{ height:8 }} />
      <button onClick={submit} style={{ padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" }}>
        Join
      </button>
      {err && <p style={{ color:"#ff6b6b" }}>{err}</p>}
    </main>
  );
}
