/**
 * routes/appliances.ts — Appliance CRUD (Session 14)
 *
 * All routes broker_pm only. Ownership enforced by property_id chain.
 *
 * GET    /api/v1/appliances?property_id=<uuid>   — list appliances for a property
 * GET    /api/v1/appliances/:id                  — get single appliance
 * PATCH  /api/v1/appliances/:id                  — update fields
 * DELETE /api/v1/appliances/:id                  — delete (blocks if in active passport)
 * GET    /api/v1/appliances/:id/recall            — live recall re-check
 */

import { Hono } from "hono";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";
import { lookupModelRegistry } from "../lib/model-lookup.js";

export const appliancesRouter = new Hono();

const BROKER = requireRole("broker_pm");

// ─── GET /api/v1/appliances?property_id=<uuid> ────────────────────────────────
appliancesRouter.get("/", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const propertyId = c.req.query("property_id");

  if (!propertyId) {
    return c.json({ error: "missing_param", message: "property_id query param required" }, 400);
  }

  // Verify broker owns the property
  const { data: prop, error: propErr } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("created_by", userId)
    .single();

  if (propErr || !prop) {
    return c.json({ error: "not_found", message: "Property not found or not owned by you" }, 404);
  }

  const { data: appliances, error } = await supabase
    .from("appliances")
    .select(
      "id, appliance_type, make, model, serial, estimated_year, recall_status, recall_url, cpsc_recall_ids, notes, photo_urls, created_at"
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: "db_error", message: error.message }, 500);

  return c.json({ appliances: appliances ?? [] });
});

// ─── GET /api/v1/appliances/:id ───────────────────────────────────────────────
appliancesRouter.get("/:id", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const { data: appliance, error } = await supabase
    .from("appliances")
    .select(
      "id, property_id, appliance_type, make, model, serial, estimated_year, recall_status, recall_url, cpsc_recall_ids, notes, photo_urls, created_at, updated_at"
    )
    .eq("id", id)
    .single();

  if (error || !appliance) {
    return c.json({ error: "not_found", message: "Appliance not found" }, 404);
  }

  // Verify broker owns the property that contains this appliance
  const { data: prop } = await supabase
    .from("properties")
    .select("id")
    .eq("id", appliance.property_id)
    .eq("created_by", userId)
    .single();

  if (!prop) {
    return c.json({ error: "forbidden", message: "Appliance not in your portfolio" }, 403);
  }

  return c.json({ appliance });
});

// ─── PATCH /api/v1/appliances/:id ────────────────────────────────────────────
appliancesRouter.patch("/:id", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  // Fetch and verify ownership
  const { data: appliance } = await supabase
    .from("appliances")
    .select("id, property_id")
    .eq("id", id)
    .single();

  if (!appliance) return c.json({ error: "not_found", message: "Appliance not found" }, 404);

  const { data: prop } = await supabase
    .from("properties")
    .select("id")
    .eq("id", appliance.property_id)
    .eq("created_by", userId)
    .single();

  if (!prop) return c.json({ error: "forbidden", message: "Appliance not in your portfolio" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  const ALLOWED = [
    "appliance_type", "make", "model", "serial",
    "estimated_year", "notes", "install_date",
  ] as const;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 1) {
    return c.json({ error: "no_fields", message: "No updatable fields provided" }, 400);
  }

  // If model changed, refresh recall status in background
  if ("model" in body && typeof body.model === "string") {
    const make = typeof body.make === "string" ? body.make : null;
    lookupModelRegistry(body.model, make).then(async (result) => {
      await supabase
        .from("appliances")
        .update({
          recall_status: result.recall_status,
          cpsc_recall_ids: result.cpsc_recall_ids,
          recall_url: result.recall_url,
        })
        .eq("id", id);
    }).catch((err) => console.warn(`[appliances] background recall refresh failed: ${err}`));
  }

  const { data: updated, error: updateErr } = await supabase
    .from("appliances")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr || !updated) {
    return c.json({ error: "db_error", message: updateErr?.message ?? "Update failed" }, 500);
  }

  return c.json({ appliance: updated });
});

// ─── DELETE /api/v1/appliances/:id ───────────────────────────────────────────
appliancesRouter.delete("/:id", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const { data: appliance } = await supabase
    .from("appliances")
    .select("id, property_id")
    .eq("id", id)
    .single();

  if (!appliance) return c.json({ error: "not_found", message: "Appliance not found" }, 404);

  const { data: prop } = await supabase
    .from("properties")
    .select("id")
    .eq("id", appliance.property_id)
    .eq("created_by", userId)
    .single();

  if (!prop) return c.json({ error: "forbidden", message: "Appliance not in your portfolio" }, 403);

  // Block delete if appliance is linked to an active passport
  const { data: passportLinks } = await supabase
    .from("passport_appliances")
    .select("passport_id, passports!inner(status)")
    .eq("appliance_id", id);

  const activeLinks = (passportLinks ?? []).filter((row: any) => {
    const status = row.passports?.status;
    return status === "sent" || status === "activated";
  });

  if (activeLinks.length > 0) {
    return c.json(
      {
        error: "appliance_in_active_passport",
        message: "Cannot delete an appliance that is part of an active passport. Revoke the passport first.",
      },
      409
    );
  }

  // Remove junction rows first
  await supabase.from("passport_appliances").delete().eq("appliance_id", id);

  const { error: deleteErr } = await supabase.from("appliances").delete().eq("id", id);

  if (deleteErr) return c.json({ error: "db_error", message: deleteErr.message }, 500);

  return c.json({ deleted: true, id });
});

// ─── GET /api/v1/appliances/:id/recall ───────────────────────────────────────
appliancesRouter.get("/:id/recall", requireAuth, BROKER, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const { data: appliance } = await supabase
    .from("appliances")
    .select("id, property_id, make, model, recall_status, recall_url, cpsc_recall_ids")
    .eq("id", id)
    .single();

  if (!appliance) return c.json({ error: "not_found", message: "Appliance not found" }, 404);

  const { data: prop } = await supabase
    .from("properties")
    .select("id")
    .eq("id", appliance.property_id)
    .eq("created_by", userId)
    .single();

  if (!prop) return c.json({ error: "forbidden", message: "Appliance not in your portfolio" }, 403);

  if (!appliance.model) {
    return c.json({ error: "no_model", message: "Appliance has no model number to check" }, 422);
  }

  const result = await lookupModelRegistry(appliance.model, appliance.make);

  // Persist refreshed recall status back to DB (non-blocking)
  supabase.from("appliances").update({
    recall_status: result.recall_status,
    cpsc_recall_ids: result.cpsc_recall_ids,
    recall_url: result.recall_url,
    updated_at: new Date().toISOString(),
  }).eq("id", id).then(({ error }) => {
    if (error) console.warn(`[recall] persist failed for ${id}: ${error.message}`);
  });

  return c.json({
    appliance_id: id,
    model: appliance.model,
    make: appliance.make,
    recall_status: result.recall_status,
    recall_url: result.recall_url,
    cpsc_recall_ids: result.cpsc_recall_ids,
    match_tier: result.match_tier,
    checked_at: new Date().toISOString(),
  });
});
