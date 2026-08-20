/**
 * routes/consumer.ts — Consumer passport views (Session 11)
 *
 * GET /api/v1/consumer/passports
 *   Returns all passports the authenticated consumer has claimed.
 *   Each entry includes property address + appliance count.
 *
 * GET /api/v1/consumer/passports/:id
 *   Full passport detail: property, appliances (with recall status),
 *   and broker branding snapshot.
 *   Consumer must have a claimed invite for this passport.
 */

import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { diagnoseAppliance } from "../lib/diagnostics.js";

export const consumerRouter = new Hono();

const CONSUMER = requireRole("consumer");

// ─── GET /api/v1/consumer/passports ──────────────────────────────────────────
consumerRouter.get("/passports", requireAuth, CONSUMER, async (c) => {
  const userId = c.get("userId");

  // Find all passport IDs this consumer has claimed via invite
  const { data: invites, error: invErr } = await supabase
    .from("passport_invites")
    .select("passport_id, activated_at")
    .eq("claimed_by", userId)
    .not("activated_at", "is", null);

  if (invErr) {
    return c.json({ error: "fetch_failed", message: invErr.message }, 500);
  }

  if (!invites || invites.length === 0) {
    return c.json({ passports: [] });
  }

  const passportIds = invites.map((i) => i.passport_id);

  // Fetch passport summaries
  const { data: passports, error: passErr } = await supabase
    .from("passports")
    .select(`
      id,
      status,
      brand_agent_name,
      brand_brokerage,
      created_at,
      properties (
        id,
        address_line1,
        address_line2,
        city,
        state,
        zip
      ),
      passport_appliances ( count )
    `)
    .in("id", passportIds)
    .order("created_at", { ascending: false });

  if (passErr) {
    return c.json({ error: "fetch_failed", message: passErr.message }, 500);
  }

  return c.json({ passports: passports ?? [] });
});

// ─── GET /api/v1/consumer/passports/:id ──────────────────────────────────────
consumerRouter.get("/passports/:id", requireAuth, CONSUMER, async (c) => {
  const userId = c.get("userId");
  const passportId = c.req.param("id");

  // Verify consumer has claimed this passport
  const { data: invite, error: invErr } = await supabase
    .from("passport_invites")
    .select("id, activated_at")
    .eq("passport_id", passportId)
    .eq("claimed_by", userId)
    .not("activated_at", "is", null)
    .limit(1)
    .single();

  if (invErr || !invite) {
    return c.json(
      { error: "not_found", message: "Passport not found or not claimed by you" },
      404
    );
  }

  // Fetch full passport with property + appliances
  const { data: passport, error: passErr } = await supabase
    .from("passports")
    .select(`
      id,
      status,
      brand_agent_name,
      brand_brokerage,
      brand_photo_url,
      brand_contact_email,
      brand_contact_phone,
      created_at,
      properties (
        id,
        address_line1,
        address_line2,
        city,
        state,
        zip
      ),
      passport_appliances (
        appliances (
          id,
          brand,
          model_number,
          serial_number,
          category,
          install_date,
          recall_status,
          recall_url,
          notes
        )
      )
    `)
    .eq("id", passportId)
    .single();

  if (passErr || !passport) {
    return c.json({ error: "not_found", message: "Passport not found" }, 404);
  }

  // Flatten appliance list
  const appliances = (
    (passport.passport_appliances as Array<{ appliances: unknown }>) ?? []
  )
    .map((pa) => pa.appliances)
    .filter(Boolean);

  return c.json({
    passport: {
      ...passport,
      passport_appliances: undefined,
      appliances,
    },
  });
});

// ─── POST /api/v1/consumer/passports/:id/appliances/:aid/diagnose ─────────────
consumerRouter.post(
  "/passports/:id/appliances/:aid/diagnose",
  requireAuth,
  CONSUMER,
  async (c) => {
    const userId = c.get("userId");
    const passportId = c.req.param("id");
    const applianceId = c.req.param("aid");

    // Verify consumer has claimed this passport
    const { data: invite, error: invErr } = await supabase
      .from("passport_invites")
      .select("id")
      .eq("passport_id", passportId)
      .eq("claimed_by", userId)
      .not("activated_at", "is", null)
      .limit(1)
      .single();

    if (invErr || !invite) {
      return c.json({ error: "forbidden", message: "Passport not claimed by you" }, 403);
    }

    // Fetch appliance details
    const { data: applianceRow, error: appErr } = await supabase
      .from("appliances")
      .select("id, brand, appliance_type, model_number, install_date")
      .eq("id", applianceId)
      .single();

    if (appErr || !applianceRow) {
      return c.json({ error: "not_found", message: "Appliance not found" }, 404);
    }

    // Verify appliance is linked to this passport
    const { data: link, error: linkErr } = await supabase
      .from("passport_appliances")
      .select("id")
      .eq("passport_id", passportId)
      .eq("appliance_id", applianceId)
      .single();

    if (linkErr || !link) {
      return c.json({ error: "forbidden", message: "Appliance not in this passport" }, 403);
    }

    let body: { symptom?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
    }

    if (!body.symptom?.trim() || body.symptom.trim().length < 5) {
      return c.json(
        { error: "missing_symptom", message: "symptom must be at least 5 characters" },
        422
      );
    }

    let diagnostic;
    try {
      diagnostic = await diagnoseAppliance(applianceRow, body.symptom.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "diagnosis_failed", message: msg }, 502);
    }

    return c.json({ diagnostic });
  }
);
