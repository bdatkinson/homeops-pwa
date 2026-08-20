/**
 * lib/model-lookup.ts — Model registry lookup with 3-tier fallback.
 *
 * Tier 1: Exact normalized match  (model_normalized = normalize(input))
 * Tier 2: pg_trgm fuzzy match     (similarity > 0.4, same make prefix)
 * Tier 3: Family prefix match     (first 6+ chars of normalized model)
 *
 * Also returns CPSC recall status from the registry.
 */

import { supabase } from "./supabase.js";

export interface ModelLookupResult {
  found: boolean;
  match_tier: "exact" | "fuzzy" | "prefix" | "none";
  make: string | null;
  model_number: string | null;
  appliance_type: string | null;
  manufacture_year_min: number | null;
  manufacture_year_max: number | null;
  recall_status: "none" | "active" | "resolved" | "unknown";
  cpsc_recall_ids: string[];
  recall_url: string | null;
  registry_id: number | null;
}

/** Strip everything except uppercase alphanumerics — matches DB generated column. */
function normalizeModel(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function lookupModelRegistry(
  rawModel: string,
  makeHint?: string | null
): Promise<ModelLookupResult> {
  const normalized = normalizeModel(rawModel);

  const empty: ModelLookupResult = {
    found: false,
    match_tier: "none",
    make: null,
    model_number: null,
    appliance_type: null,
    manufacture_year_min: null,
    manufacture_year_max: null,
    recall_status: "unknown",
    cpsc_recall_ids: [],
    recall_url: null,
    registry_id: null,
  };

  if (!normalized || normalized.length < 3) return empty;

  // ── Tier 1: Exact normalized match ──────────────────────────────────────
  const { data: exactRows } = await supabase
    .from("model_registry")
    .select(
      "id, make, model_number, appliance_type, manufacture_year_min, manufacture_year_max, recall_status, cpsc_recall_ids, recall_url"
    )
    .eq("model_normalized", normalized)
    .limit(3);

  if (exactRows && exactRows.length > 0) {
    const row = exactRows[0];
    return {
      found: true,
      match_tier: "exact",
      make: row.make,
      model_number: row.model_number,
      appliance_type: row.appliance_type,
      manufacture_year_min: row.manufacture_year_min,
      manufacture_year_max: row.manufacture_year_max,
      recall_status: row.recall_status ?? "none",
      cpsc_recall_ids: row.cpsc_recall_ids ?? [],
      recall_url: row.recall_url,
      registry_id: row.id,
    };
  }

  // ── Tier 2: pg_trgm fuzzy ───────────────────────────────────────────────
  // Use RPC function for similarity search
  const makeFilter = makeHint
    ? makeHint.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 20)
    : null;

  const { data: fuzzyRows } = await supabase.rpc("fuzzy_model_lookup", {
    p_normalized: normalized,
    p_make_hint: makeFilter,
    p_threshold: 0.4,
    p_limit: 3,
  });

  if (fuzzyRows && fuzzyRows.length > 0) {
    const row = fuzzyRows[0];
    return {
      found: true,
      match_tier: "fuzzy",
      make: row.make,
      model_number: row.model_number,
      appliance_type: row.appliance_type,
      manufacture_year_min: row.manufacture_year_min,
      manufacture_year_max: row.manufacture_year_max,
      recall_status: row.recall_status ?? "none",
      cpsc_recall_ids: row.cpsc_recall_ids ?? [],
      recall_url: row.recall_url,
      registry_id: row.id,
    };
  }

  // ── Tier 3: Family prefix (first 6 chars) ───────────────────────────────
  if (normalized.length >= 6) {
    const prefix = normalized.slice(0, 6);
    const { data: prefixRows } = await supabase
      .from("model_registry")
      .select(
        "id, make, model_number, appliance_type, manufacture_year_min, manufacture_year_max, recall_status, cpsc_recall_ids, recall_url"
      )
      .like("model_normalized", `${prefix}%`)
      .limit(1);

    if (prefixRows && prefixRows.length > 0) {
      const row = prefixRows[0];
      return {
        found: true,
        match_tier: "prefix",
        make: row.make,
        model_number: row.model_number,
        appliance_type: row.appliance_type,
        manufacture_year_min: row.manufacture_year_min,
        manufacture_year_max: row.manufacture_year_max,
        recall_status: row.recall_status ?? "none",
        cpsc_recall_ids: row.cpsc_recall_ids ?? [],
        recall_url: row.recall_url,
        registry_id: row.id,
      };
    }
  }

  return empty;
}
