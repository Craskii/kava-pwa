"use client";

import HomeActions from "@/components/HomeActions";
import { useStandalone } from "@/components/useStandalone";
import InstallPWAButton from "@/app/InstallPWAButton";
import IOSInstallTip from "@/app/IOSInstallTip";
import YourTournaments from "@/components/YourTournaments";

export default function ClientHome() {
  const standalone = useStandalone();

  if (standalone) {
    // Installed app → quick-action home + your tournaments
    return (
      <>
        <HomeActions />
        <YourTournaments />
      </>
    );
  }

  // Browser (not installed) → hero + install helpers + your tournaments
  return (
    <>
      <h1 style={{ fontSize: 28 }}>🏓 Kava Tournaments</h1>
      <p style={{ opacity: 0.8 }}>Create tournaments, queues & get turn alerts.</p>
      <InstallPWAButton />
      <IOSInstallTip />
      <YourTournaments />
    </>
  );
}
