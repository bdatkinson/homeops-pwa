/**
 * routes/webhooks.ts — Property Meld webhook intake (A1)
 *
 * POST /api/v1/webhooks/property-meld
 *   Body: PropertyMeldWorkOrderEvent (contract in lib/property-meld/types.ts)
 *   → validates signature, normalizes, classifies against A1 rules,
 *     persists intake, fires tenant SMS with single-purpose 72h link.
 *
 * POST /api/v1/webhooks/dev/simulate/property-meld   (mock mode only)
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
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { mockPropertyMeldClient, normalizeEvent, fixtureWorkOrderCreated, fixtureDirectorySync, logMockSms } from "../lib/property-meld/mock.js";
import { normalizeDirectorySync } from "../lib/property-meld/sync.js";
import { classifyIntake, generateIntakeToken, buildSmsBody, buildIntakeLink } from "../lib/property-meld/intake.js";
import type { WorkOrderIntake, IntakeToken } from "../lib/property-meld/types.js";
import { sendInviteSms } from "../lib/notify.js";

const MODE = (process.env.PROPERTY_MELD_MODE ?? "mock").toLowerCase();
const APP_URL = process.env.APP_URL ?? "https://www.homeops.biz";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

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

  // 6b. Persist the delivery metadata on the intake row so the status
  //     callback (POST /api/v1/webhooks/twilio/status) can resolve it.
  const { error: smsUpdateError } = await supabase
    .from("work_order_intake")
    .update({
      sms_sid: sms.sid,
      sms_status: sms.status,
      sms_mocked: sms.mocked ?? false,
    })
    .eq("id", row.id);
  if (smsUpdateError) {
    console.error("[webhooks/property-meld] sms metadata persist failed:", smsUpdateError.message);
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

// ─────────────────────────────────────────────────────────────────────────────
// Inbound directory sync — POST /api/v1/webhooks/property-meld/sync
// Mirrors PM's core directory (properties/units/residents/owners) into the
// pm_* tables. Real cadence: every 4h (documented sync model, 2026-08-22).
// Signature-validated the same way as the meld webhook.
// ─────────────────────────────────────────────────────────────────────────────
async function handleDirectorySync(raw: unknown) {
  const maybeSig = (raw as { signature?: string })?.signature;
  if (!mockPropertyMeldClient.verifySignature(raw, maybeSig)) {
    return { status: 401, body: { error: "invalid_signature", message: "Webhook signature verification failed" } };
  }

  const sync = normalizeDirectorySync(raw);
  const counts = {
    properties: sync.properties.length,
    units: sync.units.length,
    residents: sync.residents.length,
    owners: sync.owners.length,
  };

  // Properties first (pm_units has an FK). Store the raw record alongside.
  if (sync.properties.length) {
    const { error } = await supabase
      .from("pm_properties")
      .upsert(sync.properties.map((p) => ({ ...p, raw: p })), { onConflict: "pm_property_id" });
    if (error) return { status: 500, body: { error: "db_error", message: error.message } };
  }
  if (sync.units.length) {
    const { error } = await supabase
      .from("pm_units")
      .upsert(sync.units.map((u) => ({ ...u, raw: u })), { onConflict: "pm_unit_id" });
    if (error) return { status: 500, body: { error: "db_error", message: error.message } };
  }
  if (sync.residents.length) {
    const { error } = await supabase
      .from("pm_residents")
      .upsert(sync.residents.map((r) => ({ ...r, raw: r })), { onConflict: "pm_resident_id" });
    if (error) return { status: 500, body: { error: "db_error", message: error.message } };
  }
  if (sync.owners.length) {
    const { error } = await supabase
      .from("pm_owners")
      .upsert(sync.owners.map((o) => ({ ...o, raw: o })), { onConflict: "pm_owner_id" });
    if (error) return { status: 500, body: { error: "db_error", message: error.message } };
  }

  // Record sync bookkeeping (4h cadence tracking)
  const { error: stateError } = await supabase
    .from("pm_sync_state")
    .upsert({ direction: "inbound_directory", last_synced_at: new Date().toISOString(), record_counts: counts }, { onConflict: "direction" });
  if (stateError) console.error("[webhooks/property-meld/sync] state upsert failed:", stateError.message);

  return { status: 200, body: { accepted: true, synced_at: sync.synced_at, counts } };
}

webhooksRouter.post("/property-meld/sync", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }
  const { status, body } = await handleDirectorySync(raw);
  return c.json(body, status as 200 | 400 | 401 | 500);
});

// Dev simulator for the directory sync — 404 in live mode
webhooksRouter.post("/property-meld/dev/simulate/sync", async (c) => {
  if (MODE === "live") {
    return c.json({ error: "not_found", message: "Simulator disabled in live mode" }, 404);
  }
  let body: { overrides?: Record<string, unknown> } = {};
  try {
    body = await c.req.json();
  } catch {
    // no body → default fixture
  }
  const fixture = fixtureDirectorySync((body.overrides ?? {}) as never);
  const { status, body: result } = await handleDirectorySync(fixture);
  return c.json({ simulated_event: fixture, result }, status as 200 | 401 | 500);
});

// ─────────────────────────────────────────────────────────────────────────────
// Twilio Message Status Callback — POST /api/v1/webhooks/twilio/status
// Twilio POSTs here after each SMS we send (sent/delivered/failed/undelivered).
// Signature-validated with Twilio's HMAC-SHA1 scheme, then folded into
// sms_message_status history + the intake/invite rows.
// ─────────────────────────────────────────────────────────────────────────────
webhooksRouter.post("/twilio/status", async (c) => {
  const raw = await c.req.text();
  const params = new URLSearchParams(raw);
  const messageSid = params.get("MessageSid") ?? params.get("SmsSid");
  const status = params.get("MessageStatus") ?? params.get("SmsStatus");

  // 1. Signature check — Twilio HMAC-SHA1 over (callback URL + sorted params)
  //    Behind Fly's proxy, c.req.url is the internal URL; Twilio signs the
  //    PUBLIC URL, so rebuild it from forwarded headers.
  const signature = c.req.header("x-twilio-signature");
  if (TWILIO_AUTH_TOKEN) {
    const proto = c.req.header("x-forwarded-proto") ?? "https";
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "homeops-gateway.fly.dev";
    const query = new URL(c.req.url).search;
    const publicUrl = `${proto}://${host}${c.req.path}${query}`;
    const expected = createHmac("sha1", TWILIO_AUTH_TOKEN)
      .update(
        publicUrl +
          [...params.entries()]
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => `${k}${v}`)
            .join("")
      )
      .digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature ?? "");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      console.error(`[twilio/status] signature mismatch (publicUrl=${publicUrl})`);
      return c.json({ error: "invalid_signature", message: "Twilio signature mismatch" }, 403);
    }
  } else {
    console.warn("[twilio/status] TWILIO_AUTH_TOKEN not set — accepting unvalidated callback");
  }

  if (!messageSid || !status) {
    return c.json({ error: "invalid_payload", message: "MessageSid and MessageStatus required" }, 400);
  }

  // 2. Append to status history (one row per callback, immutable trail)
  const { error: histError } = await supabase.from("sms_message_status").insert({
    twilio_message_sid: messageSid,
    status,
    error_code: params.get("ErrorCode"),
    error_message: params.get("ErrorMessage"),
    to_phone: params.get("To"),
    from_number: params.get("From"),
    received_at: new Date().toISOString(),
  });
  if (histError) {
    console.error("[twilio/status] history insert failed:", histError.message);
    return c.json({ error: "db_error", message: histError.message }, 500);
  }

  // 3a. Fold latest status into the A1 intake row (by sms_sid)
  const { error: intakeError } = await supabase
    .from("work_order_intake")
    .update({ sms_status: status })
    .eq("sms_sid", messageSid);
  if (intakeError) console.error("[twilio/status] intake fold failed:", intakeError.message);

  // 3b. Fold terminal failures into passport invites (enum: pending|sent|failed|opened)
  if (status === "failed" || status === "undelivered") {
    const { error: inviteError } = await supabase
      .from("passport_invites")
      .update({ delivery_status: "failed" })
      .eq("twilio_message_sid", messageSid);
    if (inviteError) console.error("[twilio/status] invite fold failed:", inviteError.message);
  }

  return c.json({ ok: true, status }, 200);
});
