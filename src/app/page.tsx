import ClientHome from "@/components/ClientHome";

export default function Home() {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        gap: 16,
        fontFamily: "system-ui, sans-serif",
        padding: 16,
      }}
    >
      <ClientHome />
    </main>
  );
}
