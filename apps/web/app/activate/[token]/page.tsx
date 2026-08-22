"use client";

import { useState } from "react";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "https://homeops-gateway.fly.dev";

export default function ActivatePage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`${GATEWAY}/api/v1/invites/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.message ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "80px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Check your email</h1>
        <p style={{ color: "#999", fontSize: 15, lineHeight: 1.6 }}>
          We sent a sign-in link to <strong style={{ color: "#fff" }}>{email}</strong>.
          Click it to activate your HomeOps account — your appliances will already be there.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "80px 24px" }}>
      <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
        Activate passport
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 12px" }}>
        Your appliances are waiting.
      </h1>
      <p style={{ color: "#666", fontSize: 15, margin: "0 0 40px", lineHeight: 1.6 }}>
        Enter your email and we&apos;ll send you a sign-in link.
        No password needed.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            backgroundColor: "#2a2a2a",
            border: "1px solid #333",
            borderRadius: 4,
            padding: "14px 16px",
            fontSize: 15,
            color: "#fff",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        {status === "error" && (
          <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{errorMsg}</p>
        )}
        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            backgroundColor: status === "loading" ? "#555" : "#ffffff",
            color: "#1a1a1a",
            border: "none",
            borderRadius: 4,
            padding: "14px 28px",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: status === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {status === "loading" ? "Sending…" : "Send activation link"}
        </button>
      </form>
    </main>
  );
}
