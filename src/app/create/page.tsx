import BackButton from "../../components/BackButton"; // ✅ relative path

export default function CreatePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <BackButton />
      <h1>Create Tournament</h1>
    </main>
  );
}
