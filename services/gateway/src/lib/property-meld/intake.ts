/**
 * lib/property-meld/intake.ts — A1 intake logic (pure, testable)
 *
 * The decision seam for the SMS funnel. Everything here is deterministic
 * and side-effect free so it can be unit-tested without Supabase/Twilio.
 * The webhook route (routes/webhooks.ts) is thin glue over these functions.
 */

import { createHash, randomBytes } from "node:crypto";
import type { WorkOrderIntake, IntakeToken, WorkOrderClassification } from "./types.js";
import { isApplianceCategory } from "./mock.js";

/** Default SMS TTL for the single-purpose link (A1 rule 4). */
export const INTAKE_TOKEN_TTL_HOURS = 72;

/** Classify a normalized intake against A1 rules:
 *  1. only appliance-category tickets trigger
 *  2. only work_order.created (status updates don't fire a new SMS)
 *  3. must have a tenant phone to deliver the SMS
 */
export function classifyIntake(intake: WorkOrderIntake): WorkOrderClassification {
  if (intake.event_type !== "work_order.created") {
    return { eligible: false, reason: "not_work_order_created" };
  }
  if (!isApplianceCategory(intake.category)) {
    return { eligible: false, reason: "not_appliance_category" };
  }
  if (!intake.tenant_phone) {
    return { eligible: false, reason: "missing_tenant_phone" };
  }
  return { eligible: true, reason: "appliance_category" };
}

/**
 * Generate a single-purpose, short-TTL intake token scoped to a work order.
 * NO PII in the URL — the token is an opaque random string bound to the
 * work_order_id via an HMAC-style digest (so a leaked token can be traced
 * back to its work order without embedding any tenant data).
 */
export function generateIntakeToken(workOrderId: string, ttlHours = INTAKE_TOKEN_TTL_HOURS): IntakeToken {
  const random = randomBytes(18).toString("base64url");
  const scope = createHash("sha256").update(`homeops:wo:${workOrderId}`).digest("hex").slice(0, 12);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  return {
    token: `${scope}.${random}`,
    expires_at: expiresAt.toISOString(),
  };
}

/** Build the SMS body per A1 output spec. */
export function buildSmsBody(intake: WorkOrderIntake, link: string): string {
  const applianceLabel = intake.appliance_type
    ? intake.appliance_type.replace(/_/g, " ")
    : "appliance"; // prefix adds "your" → "your appliance issue"
  return [
    `Take Command: your ${applianceLabel} issue is queued.`,
    `Open your HomeOps diagnostic in seconds — no download.`,
    link,
    `Reply STOP to opt out.`,
  ].join("\n");
}

/** Build the deep link for an intake token (single-purpose, no PII). */
export function buildIntakeLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/p/${token}`;
}
