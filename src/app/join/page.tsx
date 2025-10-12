"use client";
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function JoinPage() {
  const r = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const listId = sp?.get("listId") || "";
    const tournamentId = sp?.get("tournamentId") || "";
    // guard both missing
    if (!listId && !tournamentId) return;
    if (listId) r.push(`/list/${encodeURIComponent(listId)}`);
    else if (tournamentId) r.push(`/t/${encodeURIComponent(tournamentId)}`);
  }, [sp, r]);

  return (
    <main style={{minHeight:"100vh",background:"#0b0b0b",color:"#fff",padding:24,fontFamily:"system-ui"}}>
      <h1>Joining…</h1>
      <p>If nothing happens, check your link or go back.</p>
      <a href="/" style={{color:"#0ea5e9"}}>Home</a>
    </main>
  );
}
