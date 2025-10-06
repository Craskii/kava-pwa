"use client";
import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        color: "white",
        borderRadius: 12,
        padding: "8px 12px",
        fontSize: 14,
        backdropFilter: "blur(10px)",
        cursor: "pointer",
      }}
    >
      ← Back
    </button>
  );
}
