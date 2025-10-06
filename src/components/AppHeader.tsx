"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AppHeader({ title }: { title?: string }) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Heuristic: if there's referrer or history length, enable back.
    setCanGoBack(!!document.referrer || (history?.length ?? 0) > 1);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        backdropFilter: "saturate(180%) blur(10px)",
        background: "rgba(11,18,32,.65)",
        color: "white",
        borderBottom: "1px solid rgba(255,255,255,.08)",
      }}
    >
      {canGoBack ? (
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(255,255,255,.08)",
            border: "none",
            color: "white",
            fontWeight: 700,
          }}
        >
          ← Back
        </button>
      ) : (
        <Link
          href="/"
          aria-label="Go home"
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(255,255,255,.08)",
            color: "white",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          ⌂ Home
        </Link>
      )}

      <div style={{ fontWeight: 700, fontSize: 16 }}>
        {title ?? "Kava Tournaments"}
      </div>
    </header>
  );
}
