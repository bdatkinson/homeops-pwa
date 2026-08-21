// HomeOps — analytics facade. The ONLY module allowed to import posthog-js.
// Every call is a no-op unless (a) consent is granted AND (b) the SDK has
// been initialized with env keys. See lib/consent.ts for the Trust #5 gate.

import posthog from "posthog-js";
import { readConsent, type ConsentState } from "./consent";

let initialized = false;
let initAttempted = false;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// US Cloud (EU override per user 2026-08-20 — P9's EU requirement dropped)
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/** Initialize PostHog — only if consent is granted and keys exist. */
export function initAnalytics(): boolean {
  if (initialized || initAttempted) return initialized;
  initAttempted = true;

  const consent: ConsentState = readConsent();
  if (consent !== "granted") {
    // Gate stays closed. Probe already recorded the decision; nothing ships.
    return false;
  }
  if (!KEY) {
    if (typeof window !== "undefined") {
      console.warn("[homeops] PostHog key missing — analytics stays off");
    }
    return false;
  }

  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: true,
    capture_pageleave: false,
    persistence: "localStorage+cookie",
    autocapture: false,
    disable_session_recording: true,
    // EU-cloud data-sovereignty posture (default HOST above is eu.i.posthog.com).
  });
  initialized = true;
  return true;
}

export function capture(event: string, props?: Record<string, unknown>): void {
  if (!initAnalytics()) return;
  posthog.capture(event, props);
}

export function identify(distinctId: string, props?: Record<string, unknown>): void {
  if (!initAnalytics()) return;
  posthog.identify(distinctId, props);
}

export function resetAnalytics(): void {
  if (!initAnalytics()) return;
  posthog.reset();
}

export function isAnalyticsActive(): boolean {
  return initialized;
}
