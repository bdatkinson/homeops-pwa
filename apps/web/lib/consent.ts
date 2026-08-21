// HomeOps — Trust #5 consent gate (capability probe).
//
// Rule from P9 / 10-Point Trust Constitution:
//   "capability probe records consent before any analytics SDK initializes."
// This module is the ONLY way analytics may start. Nothing in this app may
// import posthog-js directly — always go through `lib/analytics.ts`, which
// checks this gate first.

export type ConsentState = "undecided" | "granted" | "denied";

const STORAGE_KEY = "homeops.consent.analytics.v1";

export function readConsent(): ConsentState {
  if (typeof window === "undefined") return "undecided";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "granted") return "granted";
    if (raw === "denied") return "denied";
  } catch {
    // localStorage unavailable (private mode / disabled) — safest default.
    return "denied";
  }
  return "undecided";
}

export function grantConsent(): ConsentState {
  try {
    window.localStorage.setItem(STORAGE_KEY, "granted");
  } catch {
    /* no-op — gate stays closed for this session */
  }
  recordProbe("granted");
  return "granted";
}

export function denyConsent(): ConsentState {
  try {
    window.localStorage.setItem(STORAGE_KEY, "denied");
  } catch {
    /* no-op */
  }
  recordProbe("denied");
  return "denied";
}

/**
 * The capability probe: records the consent decision in a first-party,
 * cookieless event BEFORE any analytics SDK has initialized. This is the
 * audit trail that proves Trust #5 — analytics never runs ahead of consent.
 */
function recordProbe(state: Exclude<ConsentState, "undecided">): void {
  try {
    // First-party beacon only — no third-party SDK involved.
    const payload = {
      event: "consent_probe",
      state,
      ts: new Date().toISOString(),
    };
    // Best-effort: persist to localStorage audit trail; a future gateway
    // endpoint can sink these once Supabase is wired (E-path).
    const trailKey = "homeops.consent.trail.v1";
    const trail = JSON.parse(window.localStorage.getItem(trailKey) || "[]");
    trail.push(payload);
    window.localStorage.setItem(trailKey, JSON.stringify(trail.slice(-200)));
  } catch {
    /* probe is best-effort by design */
  }
}

export function consentTrail(): unknown[] {
  try {
    return JSON.parse(window.localStorage.getItem("homeops.consent.trail.v1") || "[]");
  } catch {
    return [];
  }
}
