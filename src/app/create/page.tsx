export default function CreatePage() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Create a tournament</h1>
      <form style={{ display: "grid", gap: 12, width: "100%", maxWidth: 520 }}>
        <label>
          Name
          <input style={input} placeholder="e.g. Friday Night Bracket" />
        </label>
        <label>
          Private? (4-digit code)
          <input style={input} placeholder="Optional code e.g. 1234" maxLength={4} />
        </label>
        <button style={btn}>Create</button>
      </form>
    </main>
  );
}
const wrap: React.CSSProperties = { minHeight:"100vh", display:"grid", placeItems:"center", padding:24, color:"#fff", background:"#0b0b0b", fontFamily:"system-ui" };
const h1: React.CSSProperties = { marginTop:0, marginBottom:16 };
const input: React.CSSProperties = { width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #333", background:"#111", color:"#fff", marginTop:6 };
const btn: React.CSSProperties = { padding:"12px 16px", borderRadius:12, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, marginTop:8 };
