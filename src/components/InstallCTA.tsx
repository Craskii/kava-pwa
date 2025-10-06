import InstallCTA from "../components/InstallCTA";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen text-center">
      <h1 className="text-2xl font-bold mb-4">🏓 Kava Tournaments</h1>
      <p className="text-gray-400">Create tournaments, queues & get turn alerts.</p>

      {/* 👇 This shows the install banner when available */}
      <InstallCTA />
    </main>
  );
}
