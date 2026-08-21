"use client";

import { useEffect } from "react";
import { initAnalytics, capture } from "../lib/analytics";
import { readConsent } from "../lib/consent";

/**
 * Trust #5 bootstrap — mounted from the server layout as a client leaf.
 * The capability probe (lib/consent.ts) records consent state first; the
 * PostHog SDK initializes ONLY if consent === "granted" AND keys exist.
 */
export default function ConsentBootstrap() {
  useEffect(() => {
    const consent = readConsent();
    const ok = initAnalytics();
    capture("app_loaded", { consent, analytics: ok });
  }, []);
  return null;
}
