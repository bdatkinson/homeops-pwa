/**
 * routes/public.ts — Unauthenticated public endpoints
 *
 * GET /api/v1/passports/public/:token
 *   Looks up a passport by its public_token.
 *   Returns property address, appliances, and broker branding.
 *   Used by the web app's /p/[token] page.
 *
 * POST /api/v1/invites/claim
 *   Body: { token: string, email: string }
 *   Validates the invite token, then sends a Supabase magic link to the email.
 *   Unauthenticated — consumer clicks a link, lands here, enters their email.
 */

import { Hono } from "hono";
import { supabase } from "../lib/supabase.js";

export const publicRouter = new Hono();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/passports/public/:token
// Lookup passport by public_token — no auth required
// ─────────────────────────────────────────────────────────────────────────────
publicRouter.get("/passports/public/:token", async (c) => {
  const publicToken = c.req.param("token");

  // Find passport by public_token
  const { data: passport, error: passErr } = await supabase
    .from("passports")
    .select("id, status, public_token, broker_id, property_id, created_at")
    .eq("public_token", publicToken)
    .single();

  if (passErr || !passport) {
    return c.json({ error: "not_found", message: "Passport not found" }, 404);
  }

  // Fetch property
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("id, address_line1, address_line2, city, state, zip, country")
    .eq("id", passport.property_id)
    .single();

  if (propErr || !property) {
    return c.json({ error: "not_found", message: "Property not found" }, 404);
  }

  // Fetch broker profile
  const { data: broker } = await supabase
    .from("profiles")
    .select("full_name, brokerage_name, agent_photo_url, phone")
    .eq("id", passport.broker_id)
    .single();

  // Fetch appliances via junction table
  const { data: junctionRows } = await supabase
    .from("passport_appliances")
    .select("appliance_id")
    .eq("passport_id", passport.id);

  const applianceIds = (junctionRows ?? []).map((r) => r.appliance_id);

  let appliances: {
    id: string;
    appliance_type: string;
    make: string | null;
    model_number: string | null;
  }[] = [];

  if (applianceIds.length > 0) {
    const { data } = await supabase
      .from("appliances")
      .select("id, appliance_type, make, model_number")
      .in("id", applianceIds);
    appliances = data ?? [];
  }

  return c.json({
    id: passport.id,
    status: passport.status,
    property: {
      address_line1: property.address_line1,
      address_line2: property.address_line2,
      city: property.city,
      state: property.state,
      zip: property.zip,
    },
    broker: {
      full_name: broker?.full_name ?? null,
      brokerage_name: broker?.brokerage_name ?? null,
      agent_photo_url: broker?.agent_photo_url ?? null,
      phone: broker?.phone ?? null,
    },
    appliances,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/invites/claim
// Unauthenticated — validates invite token, sends magic link to email
// ─────────────────────────────────────────────────────────────────────────────
publicRouter.post("/invites/claim", async (c) => {
  let body: { token?: string; email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  const { token, email } = body;

  if (!token?.trim()) {
    return c.json({ error: "missing_field", message: "token is required" }, 400);
  }
  if (!email?.trim() || email.indexOf("@") === -1) {
    return c.json({ error: "missing_field", message: "valid email is required" }, 400);
  }

  // Validate the invite token exists and is unclaimed
  const { data: invite, error: inviteErr } = await supabase
    .from("passport_invites")
    .select("id, passport_id, claimed_by, activated_at, expires_at, invited_email")
    .eq("token", token)
    .single();

  if (inviteErr || !invite) {
    return c.json({ error: "invalid_token", message: "Invite token not found or invalid" }, 404);
  }

  // Check if already claimed
  if (invite.claimed_by && invite.activated_at) {
    return c.json(
      { error: "already_claimed", message: "This invite has already been activated" },
      409
    );
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return c.json({ error: "expired", message: "This invite link has expired" }, 410);
  }

  // Store the email on the invite so we can match after sign-in
  await supabase
    .from("passport_invites")
    .update({ invited_email: email })
    .eq("id", invite.id)
    .is("invited_email", null); // only set if not already set

  // Send Supabase magic link OTP via the admin client (service role)
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: {
        role: "consumer",
        invite_token: token,
        passport_id: invite.passport_id,
      },
      shouldCreateUser: true,
    },
  });

  if (otpErr) {
    console.error("[invites/claim] OTP send failed:", otpErr.message);
    return c.json(
      { error: "otp_failed", message: "Could not send sign-in link. Please try again." },
      502
    );
  }

  return c.json({
    status: "sent",
    message: "Sign-in link sent. Check your email to activate your passport.",
  });
});
