import BackButton from "../../components/BackButton"; // ✅ relative path

export default function NearbyPage() {
  return (
    <main style={wrap}>
      <h1 style={{ margin:0 }}>Nearby tournaments</h1>
      <p style={{ opacity:.8 }}>
        (Coming soon) We’ll ask for location permission and list kava bars hosting events around you.
      </p>
    </main>
  );
}
const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", textAlign:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
