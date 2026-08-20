/**
 * routes/properties.ts — Property CRUD (Session 10)
 *
 * All routes broker-only (requireRole broker_pm).
 * RLS is enforced at DB level; gateway adds the broker ownership check.
 *
 * GET    /api/v1/properties          — list broker's properties
 * POST   /api/v1/properties          — create property
 * PATCH  /api/v1/properties/:id      — update property
 * DELETE /api/v1/properties/:id      — delete (only if no passports reference it)
 */

import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

export const propertiesRouter = new Hono();

const BROKER = requireRole("broker_pm");

// ─── GET /api/v1/properties ───────────────────────────────────────────────────
propertiesRouter.get("/", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("properties")
    .select(
      "id, address_line1, address_line2, city, state, zip, country, created_at"
    )
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: "fetch_failed", message: error.message }, 500);
  }

  return c.json({ properties: data ?? [] });
});

// ─── POST /api/v1/properties ──────────────────────────────────────────────────
propertiesRouter.post("/", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");

  let body: {
    address_line1?: string;
    address_line2?: string | null;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Request body must be JSON" }, 400);
  }

  const { address_line1, city, state } = body;
  if (!address_line1?.trim() || !city?.trim() || !state?.trim()) {
    return c.json(
      { error: "missing_fields", message: "address_line1, city, and state are required" },
      422
    );
  }

  const { data, error } = await supabase
    .from("properties")
    .insert({
      address_line1: address_line1.trim(),
      address_line2: body.address_line2?.trim() ?? null,
      city: city.trim(),
      state: state.trim().toUpperCase().slice(0, 2),
      zip: body.zip?.trim() ?? null,
      country: body.country?.trim() ?? "US",
      created_by: userId,
    })
    .select("id, address_line1, address_line2, city, state, zip, country, created_at")
    .single();

  if (error) {
    return c.json({ error: "insert_failed", message: error.message }, 500);
  }

  return c.json({ property: data }, 201);
});

// ─── PATCH /api/v1/properties/:id ────────────────────────────────────────────
propertiesRouter.patch("/:id", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const propertyId = c.req.param("id");

  // Verify ownership
  const { data: existing, error: findErr } = await supabase
    .from("properties")
    .select("id, created_by")
    .eq("id", propertyId)
    .single();

  if (findErr || !existing) {
    return c.json({ error: "not_found", message: "Property not found" }, 404);
  }
  if (existing.created_by !== userId) {
    return c.json({ error: "forbidden", message: "Not your property" }, 403);
  }

  let body: Record<string, string | null>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Request body must be JSON" }, 400);
  }

  // Only allow safe fields
  const allowed = ["address_line1", "address_line2", "city", "state", "zip", "country"];
  const updates: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "no_updates", message: "No valid fields to update" }, 422);
  }

  const { data, error } = await supabase
    .from("properties")
    .update(updates)
    .eq("id", propertyId)
    .select("id, address_line1, address_line2, city, state, zip, country, created_at")
    .single();

  if (error) {
    return c.json({ error: "update_failed", message: error.message }, 500);
  }

  return c.json({ property: data });
});

// ─── DELETE /api/v1/properties/:id ───────────────────────────────────────────
propertiesRouter.delete("/:id", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const propertyId = c.req.param("id");

  // Verify ownership
  const { data: existing, error: findErr } = await supabase
    .from("properties")
    .select("id, created_by")
    .eq("id", propertyId)
    .single();

  if (findErr || !existing) {
    return c.json({ error: "not_found", message: "Property not found" }, 404);
  }
  if (existing.created_by !== userId) {
    return c.json({ error: "forbidden", message: "Not your property" }, 403);
  }

  // Block delete if passports reference this property
  const { count } = await supabase
    .from("passports")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  if ((count ?? 0) > 0) {
    return c.json(
      {
        error: "has_passports",
        message: "Cannot delete a property that has passports. Archive or delete passports first.",
      },
      409
    );
  }

  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", propertyId);

  if (error) {
    return c.json({ error: "delete_failed", message: error.message }, 500);
  }

  return c.json({ deleted: true });
});
