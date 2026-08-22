"use client";

/**
 * StartDiagnostic — the A2 landing CTA.
 *
 * Posts to the gateway to create a guest diagnostic session scoped to the
 * single-purpose intake token (the token IS the credential — no sign-in).
 * Idempotent server-side: a second click returns the already-started session.
 */

import { useState } from "react";

export default function StartDiagnostic({
  token,
  gateway,
  alreadyStarted = false,
}: {
  token: string;
  gateway: string;
  alreadyStarted?: boolean;
}) {
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">(
    alreadyStarted ? "started" : "idle"
  );
  const [sessionId, setSessionId] = useState<string | null>(null);

  async function start() {
    setState("starting");
    try {
      const res = await fetch(
        `${gateway}/api/v1/intake/public/${encodeURIComponent(token)}/diagnostic`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "start failed");
      setSessionId(json.session_id);
      setState("started");
    } catch {
      setState("error");
    }
  }

  if (state === "started") {
    return (
      <div style={{ backgroundColor: "#2a2a2a", borderLeft: "2px solid #ffffff", padding: "24px" }}>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>
          Diagnostic started ✓
        </p>
        <p style={{ fontSize: 14, color: "#999", margin: "0 0 4px", lineHeight: 1.6 }}>
          Your issue is being triaged. Watch your phone — next steps are on the way.
        </p>
        {sessionId && (
          <p style={{ fontSize: 11, color: "#555", margin: "12px 0 0" }}>
            session {sessionId.slice(0, 8)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={start}
        disabled={state === "starting"}
        style={{
          display: "inline-block",
          backgroundColor: state === "error" ? "#333" : "#ffffff",
          color: state === "error" ? "#fff" : "#1a1a1a",
          padding: "14px 28px",
          fontWeight: 600,
          fontSize: 15,
          border: "none",
          borderRadius: 4,
          cursor: state === "starting" ? "default" : "pointer",
          opacity: state === "starting" ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        {state === "starting" ? "Opening diagnostic…" : "Start diagnostic →"}
      </button>
      {state === "error" && (
        <p style={{ fontSize: 13, color: "#999", margin: "12px 0 0" }}>
          Couldn&apos;t start the diagnostic. <a href="#" onClick={(e) => { e.preventDefault(); setState("idle"); }} style={{ color: "#fff" }}>Try again</a>
        </p>
      )}
    </div>
  );
}
