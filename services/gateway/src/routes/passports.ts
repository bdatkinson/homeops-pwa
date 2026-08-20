/**
 * routes/passports.ts — Passport CRUD (Session 6)
 *
 * POST /api/v1/passports
 *   Body: { property_id, appliance_ids[], branding? }
 *   Creates passport + links appliances. Broker only.
 *
 * GET /api/v1/passports/:id
 *   Returns passport with property + appliance list.
 *   Broker sees own; consumer sees claimed. Service role reads all.
 *
 * PUT /api/v1/passports/:id
 *   Body: { brand_agent_name?, brand_brokerage?, brand_photo_url?,
 *           brand_contact_email?, brand_contact_phone? }
 *   Updates branding snapshot. Broker (owner) only.
 */

import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

export const passportsRouter = new Hono();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/passports — list broker's passports
// ─────────────────────────────────────────────────────────────────────────────
passportsRouter.get("/", requireAuth, requireRole("broker_pm"), async (c) => {
  const userId = c.get("userId");

  const { data: passports, error } = await supabase
    .from("passports")
    .select(`
      id, status, appliance_count, created_at, activated_at,
      brand_agent_name, brand_brokerage,
      properties(id, address_line1, address_line2, city, state, zip)
    `)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: "db_error", message: error.message }, 500);

  return c.json({ passports: passports ?? [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/passports — create passport + appliance associations
// ─────────────────────────────────────────────────────────────────────────────
passportsRouter.post("/", requireAuth, requireRole("broker_pm"), async (c) => {
  const userId = c.get("userId");

  let body: {
    property_id?: string;
    appliance_ids?: string[];
    brand_agent_name?: string;
    brand_brokerage?: string;
    brand_photo_url?: string;
    brand_contact_email?: string;
    brand_contact_phone?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  const { property_id, appliance_ids = [] } = body;

  if (!property_id) {
    return c.json({ error: "missing_field", message: "property_id is required" }, 400);
  }

  // ── Verify property belongs to this broker ──────────────────────────────
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("id, address_line1, city, state")
    .eq("id", property_id)
    .eq("created_by", userId)
    .single();

  if (propErr || !property) {
    return c.json(
      { error: "not_found", message: "Property not found or not owned by you" },
      404
    );
  }

  // ── Verify all appliances belong to this property ───────────────────────
  if (appliance_ids.length > 0) {
    const { data: appls, error: applErr } = await supabase
      .from("appliances")
      .select("id")
      .in("id", appliance_ids)
      .eq("property_id", property_id);

    if (applErr) {
      return c.json({ error: "db_error", message: applErr.message }, 500);
    }

    const foundIds = new Set((appls ?? []).map((a) => a.id));
    const missing = appliance_ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return c.json(
        { error: "invalid_appliance_ids", message: "Some appliance IDs not found on this property", missing },
        400
      );
    }
  }

  // ── Fetch broker profile for branding defaults ──────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, brokerage_name, agent_photo_url, phone")
    .eq("id", userId)
    .single();

  // ── Create passport ─────────────────────────────────────────────────────
  const { data: passport, error: passErr } = await supabase
    .from("passports")
    .insert({
      property_id,
      created_by: userId,
      status: "draft",
      appliance_count: appliance_ids.length,
      brand_agent_name: body.brand_agent_name ?? profile?.full_name ?? null,
      brand_brokerage: body.brand_brokerage ?? profile?.brokerage_name ?? null,
      brand_photo_url: body.brand_photo_url ?? profile?.agent_photo_url ?? null,
      brand_contact_phone: body.brand_contact_phone ?? profile?.phone ?? null,
      brand_contact_email: body.brand_contact_email ?? null,
    })
    .select()
    .single();

  if (passErr || !passport) {
    return c.json({ error: "db_error", message: passErr?.message ?? "Insert failed" }, 500);
  }

  // ── Link appliances (junction table) ───────────────────────────────────
  if (appliance_ids.length > 0) {
    const junctionRows = appliance_ids.map((appliance_id) => ({
      passport_id: passport.id,
      appliance_id,
    }));

    const { error: junctionErr } = await supabase
      .from("passport_appliances")
      .insert(junctionRows);

    if (junctionErr) {
      // Rollback passport
      await supabase.from("passports").delete().eq("id", passport.id);
      return c.json({ error: "db_error", message: `Appliance link failed: ${junctionErr.message}` }, 500);
    }
  }

  return c.json(
    {
      passport,
      property: { id: property.id, address_line1: property.address_line1, city: property.city, state: property.state },
      appliance_count: appliance_ids.length,
    },
    201
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/passports/:id — fetch passport with property + appliances
// ─────────────────────────────────────────────────────────────────────────────
passportsRouter.get("/:id", requireAuth, async (c) => {
  const passportId = c.req.param("id");
  const userId = c.get("userId");
  const userRole = c.get("userRole");

  // Fetch passport — service role bypasses RLS; we enforce manually
  const { data: passport, error: passErr } = await supabase
    .from("passports")
    .select(`
      *,
      properties (
        id, address_line1, address_line2, city, state, zip, country,
        latitude, longitude, google_place_id
      )
    `)
    .eq("id", passportId)
    .single();

  if (passErr || !passport) {
    return c.json({ error: "not_found", message: "Passport not found" }, 404);
  }

  // ── Access control ───────────────────────────────────────────────────────
  if (userRole === "broker_pm") {
    // Broker must own the passport
    if (passport.created_by !== userId) {
      return c.json({ error: "forbidden", message: "This passport belongs to another broker" }, 403);
    }
  } else {
    // Consumer: must have a claimed invite
    const { data: invite } = await supabase
      .from("passport_invites")
      .select("id")
      .eq("passport_id", passportId)
      .eq("claimed_by", userId)
      .not("activated_at", "is", null)
      .single();

    if (!invite) {
      return c.json({ error: "forbidden", message: "You do not have access to this passport" }, 403);
    }
  }

  const property = (passport.properties as Array<{ id: string, address_line1: string, address_line2: string, city: string, state: string, zip: string, country: string, latitude: number, longitude: number, google_place_id: string }>)[0];

  // ── Fetch appliances via junction ────────────────────────────────────────
  const { data: junctionRows } = await supabase
    .from("passport_appliances")
    .select("appliance_id")
    .eq("passport_id", passportId);

  const applianceIds = (junctionRows ?? []).map((r) => r.appliance_id);

  let appliances: unknown[] = [];
  if (applianceIds.length > 0) {
    const { data } = await supabase
      .from("appliances")
      .select("id, appliance_type, make, model, serial, estimated_year, recall_status, cpsc_recall_ids, photo_urls, registration_method, notes")
      .in("id", applianceIds);
    appliances = data ?? [];
  }

  return c.json({ passport, property, appliances });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/passports/:id — update branding snapshot
// ─────────────────────────────────────────────────────────────────────────────
passportsRouter.put("/:id", requireAuth, requireRole("broker_pm"), async (c) => {
  const passportId = c.req.param("id");
  const userId = c.get("userId");

  // Confirm ownership
  const { data: existing } = await supabase
    .from("passports")
    .select("id, created_by, status")
    .eq("id", passportId)
    .single();

  if (!existing) {
    return c.json({ error: "not_found", message: "Passport not found" }, 404);
  }
  if (existing.created_by !== userId) {
    return c.json({ error: "forbidden", message: "Not your passport" }, 403);
  }

  let body: {
    brand_agent_name?: string;
    brand_brokerage?: string;
    brand_photo_url?: string;
    brand_contact_email?: string;
    brand_contact_phone?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  // Only allow branding fields in PUT
  const allowed = [
    "brand_agent_name", "brand_brokerage", "brand_photo_url",
    "brand_contact_email", "brand_contact_phone",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "no_fields", message: "No updatable fields provided" }, 400);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("passports")
    .update(updates)
    .eq("id", passportId)
    .select()
    .single();

  if (updateErr || !updated) {
    return c.json({ error: "db_error", message: updateErr?.message ?? "Update failed" }, 500);
  }

  return c.json({ passport: updated });
});
