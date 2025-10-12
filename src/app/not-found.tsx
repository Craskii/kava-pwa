export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main style={{
      minHeight: "100vh", background: "#0b0b0b", color: "#fff",
      display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui"
    }}>
      <div style={{
        maxWidth: 560, width: "100%", background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 18, textAlign: "center"
      }}>
        <h1 style={{margin: "0 0 6px"}}>Oops — page not found</h1>
        <p style={{opacity:.8, margin:"0 0 12px"}}>
          The page you’re looking for doesn’t exist or was moved.
        </p>
        <a href="/" style={{
          display: "inline-block", padding: "10px 14px", borderRadius: 10,
          background: "#0ea5e9", color: "#fff", fontWeight: 700, textDecoration: "none"
        }}>
          Go home
        </a>
      </div>
    </main>
  );
}
