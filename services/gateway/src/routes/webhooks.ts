/**
 * routes/webhooks.ts — Property Meld webhook intake (A1)
 *
 * POST /api/v1/webhooks/property-meld
 *   Body: PropertyMeldWorkOrderEvent (contract in lib/property-meld/types.ts)
 *   → validates signature, normalizes, classifies against A1 rules,
 *     persists intake, fires tenant SMS with single-purpose 72h link.
 *
 * POST /api/v1/dev/simulate/property-meld   (mock mode only)
 *   Body: { fixture?: number, overrides?: Partial<WorkOrderEvent> }
 *   → posts a generated fixture through the SAME handler path, so the
 *     funnel is demoable and testable without the real sandbox (OQ-01).
 *
 * Mock mode is the default until the real Property Meld sandbox lands
 * (P4). Toggle: PROPERTY_MELD_MODE=mock|live. In mock mode with no
 * Twilio creds, SMS delivery is logged via logMockSms — the intake row
 * and token are still persisted exactly as in live.
 */

import { Hono } from "hono";
import { supabase } from "../lib/supabase.js";
import { mockPropertyMeldClient, normalizeEvent, fixtureWorkOrderCreated, logMockSms } from "../lib/property-meld/mock.js";
import { classifyIntake, generateIntakeToken, buildSmsBody, buildIntakeLink } from "../lib/property-meld/intake.js";
import type { WorkOrderIntake, IntakeToken } from "../lib/property-meld/types.js";
import { sendInviteSms } from "../lib/notify.js";

const MODE = (process.env.PROPERTY_MELD_MODE ?? "mock").toLowerCase();
const APP_URL = process.env.APP_URL ?? "https://homeoperator.app";

export const webhooksRouter = new Hono();

/** Shared handler — used by the real webhook AND the mock simulator. */
async function handleWorkOrderEvent(raw: unknown) {
  // 1. Signature check (no-op in mock, HMAC when live)
  const maybeSig = (raw as { signature?: string })?.signature;
  if (!mockPropertyMeldClient.verifySignature(raw, maybeSig)) {
    return { status: 401, body: { error: "invalid_signature", message: "Webhook signature verification failed" } };
  }

  // 2. Normalize to HomeOps intake model
  const intake: WorkOrderIntake = normalizeEvent(raw);

  // 3. Classify against A1 rules
  const classification = classifyIntake(intake);
  if (!classification.eligible) {
    // Not a trigger — acknowledge the webhook, persist nothing.
    return { status: 200, body: { accepted: false, reason: classification.reason } };
  }

  // 4. Issue single-purpose 72h token scoped to the work order
  const tokenObj: IntakeToken = generateIntakeToken(intake.work_order_id);

  // 5. Persist intake row (idempotent per work order + created event)
  const { data: row, error: dbError } = await supabase
    .from("work_order_intake")
    .insert({
      provider: intake.provider,
      work_order_id: intake.work_order_id,
      property_id: intake.property_id,
      unit_id: intake.unit_id,
      category: intake.category,
      title: intake.title,
      description: intake.description,
      tenant_name: intake.tenant_name,
      tenant_phone: intake.tenant_phone,
      appliance_type: intake.appliance_type,
      event_type: intake.event_type,
      token: tokenObj.token,
      token_expires_at: tokenObj.expires_at,
    })
    .select("id, work_order_id, token, token_expires_at")
    .single();

  if (dbError || !row) {
    console.error("[webhooks/property-meld] intake persist failed:", dbError?.message);
    return { status: 500, body: { error: "db_error", message: "Could not persist intake" } };
  }

  // 6. Fire the tenant SMS with the single-purpose link (mock-safe)
  const link = buildIntakeLink(APP_URL, row.token);
  const smsBody = buildSmsBody(intake, link);

  let sms: { sid: string; status: string; mocked?: boolean };
  if (MODE === "live") {
    if (!intake.tenant_phone) {
      return { status: 500, body: { error: "no_phone", message: "No tenant phone" } };
    }
    sms = await sendInviteSms(intake.tenant_phone, link, "HomeOps");
  } else {
    sms = logMockSms(intake.tenant_phone!, smsBody);
  }

  return {
    status: 201,
    body: {
      accepted: true,
      intake_id: row.id,
      work_order_id: row.work_order_id,
      sms: { sid: sms.sid, status: sms.status, mocked: sms.mocked ?? false },
      link,
      token_expires_at: row.token_expires_at,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real webhook endpoint — unauthenticated (provider calls us)
// ─────────────────────────────────────────────────────────────────────────────
webhooksRouter.post("/property-meld", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }
  const { status, body } = await handleWorkOrderEvent(raw);
  return c.json(body, status as 200 | 201 | 400 | 401 | 500);
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock simulator — dev/demo only; 404 in live mode
// ─────────────────────────────────────────────────────────────────────────────
webhooksRouter.post("/dev/simulate/property-meld", async (c) => {
  if (MODE === "live") {
    return c.json({ error: "not_found", message: "Simulator disabled in live mode" }, 404);
  }
  let body: { fixture?: number; overrides?: Record<string, unknown> } = {};
  try {
    body = await c.req.json();
  } catch {
    // no body → default fixture
  }
  const fixture = fixtureWorkOrderCreated((body.overrides ?? {}) as never);
  const { status, body: result } = await handleWorkOrderEvent(fixture);
  return c.json({ simulated_event: fixture, result }, status as 200 | 201 | 401 | 500);
});
