"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

async function findByCodeRemote(code: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/by-code/${code}`, {
      method: "GET",
      headers: { "accept": "application/json" },
    });

    // tolerate either JSON or plain text "null"
    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* not JSON; keep raw text */
    }

    if (typeof payload === "string" && payload && payload !== "null") return payload;
    return null;
  } catch {
    return null;
  }
}

export default function JoinByCodePage() {
  const r = useRouter();

  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // keep only digits and cap at 4 chars
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCode(digits);
    if (err) setErr("");
  };

  const onJoin = async () => {
    if (code.length !== 4) {
      setErr("Enter the 4-digit code.");
      return;
    }
    setLoading(true);
    setErr("");
    const id = await findByCodeRemote(code);
    setLoading(false);

    if (id) {
      r.push(`/t/${id}`);
    } else {
      setErr("No tournament found for that code. Double-check and try again.");
    }
  };

  const disabled = loading || code.length !== 4;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <AppHeader title="Join with Code" />
      <div style={{ padding: 16, maxWidth: 520, margin: "0 auto", display: "grid", gap: 12 }}>
        <label style={{ display: "block" }}>
          4-digit code
          <input
            inputMode="numeric"
            pattern="\d*"
            autoComplete="one-time-code"
            placeholder="1234"
            value={code}
            onChange={onChange}
            style={input}
          />
        </label>

        <button
          type="button"
          onClick={onJoin}
          disabled={disabled}
          style={{ ...primary, opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
        >
          {loading ? "Joining…" : "Join"}
        </button>

        {err && (
          <div style={errorBox}>
            {err}
          </div>
        )}

        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
          Ask the host for the 4-digit code shown on their tournament screen.
        </p>
      </div>
    </main>
  );
}

const input: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.15)",
  background: "rgba(255,255,255,.06)",
  color: "white",
  outline: "none",
  fontSize: 18,
  letterSpacing: 2,
  textAlign: "center",
};

const primary: React.CSSProperties = {
  marginTop: 4,
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "#0ea5e9",
  color: "white",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "#3f1f1f",
  border: "1px solid #7f2b2b",
  color: "#ffd1d1",
  fontSize: 14,
};
