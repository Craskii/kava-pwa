"use client";

export default function Bracket({ rounds }: { rounds: { p1?: string; p2?: string }[][] }) {
  // simple 2D column layout; lines are minimal for now
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridAutoFlow: "column", gap: 24, paddingBottom: 8 }}>
        {rounds.map((round, r) => (
          <div key={r} style={{ minWidth: 220 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {r === 0 ? "Round 1" : `Round ${r + 1}`}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {round.map((m, i) => (
                <div key={i} style={box}>
                  <div style={{ fontWeight: 600 }}>{m.p1 ?? "TBD"}</div>
                  <div style={{ opacity: .7, fontSize: 12, margin: "4px 0" }}>vs</div>
                  <div style={{ fontWeight: 600 }}>{m.p2 ?? "TBD"}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const box: React.CSSProperties = {
  padding: 12, borderRadius: 12,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.1)",
  display: "grid", placeItems: "center",
};
