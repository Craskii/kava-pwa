import BackButton from "../../components/BackButton"; // ✅ relative path

export default function NearbyPage() {
  return (
    <main style={wrap}>
      <BackButton />
      <div style={{ textAlign:"center", maxWidth:520 }}>
        <h1 style={{ margin: "48px 0 8px" }}>Nearby Tournaments</h1>
        <p style={{ opacity:.85 }}>
          (Coming soon) We’ll ask for location permission and list kava bars hosting events around you.
        </p>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
