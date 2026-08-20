/**
 * routes/walk-through.ts — POST /api/v1/walk-through/scan
 *
 * Session 4 endpoint: receives a model plate photo, runs GPT-4o-mini OCR,
 * normalizes, looks up the model registry, and returns structured appliance data
 * with recall status.
 *
 * Request body (multipart/form-data OR JSON):
 *   - image: file (multipart) OR base64 string (JSON)
 *   - mime_type?: "image/jpeg" | "image/png" | "image/webp"  (default: image/jpeg)
 *
 * Response 200:
 * {
 *   ocr: { make, appliance_type, model, serial, year, raw_text, low_contrast_warning },
 *   registry: { found, match_tier, make, model_number, appliance_type, ... recall_status },
 *   scan_id: string,  // UUID for audit log
 *   requires_confirmation: boolean,  // always true — broker must verify
 *   low_contrast_warning: boolean
 * }
 */

import { Hono } from "hono";
import { extractModelPlateOcr, type OcrResult } from "../lib/ocr.js";
import { lookupModelRegistry } from "../lib/model-lookup.js";
import { supabase } from "../lib/supabase.js";

export const walkThroughRouter = new Hono();

walkThroughRouter.post("/scan", async (c) => {
  const scanId = crypto.randomUUID();
  const startedAt = Date.now();

  // ── Parse request ────────────────────────────────────────────────────────
  let imageBase64: string;
  let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";

  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    // Multipart — mobile camera capture
    const form = await c.req.formData();
    const file = form.get("image") as File | null;
    if (!file) {
      return c.json({ error: "missing_image", message: "No image file in form data" }, 400);
    }
    const buf = await file.arrayBuffer();
    imageBase64 = Buffer.from(buf).toString("base64");
    if (file.type && file.type.startsWith("image/")) {
      mimeType = file.type as typeof mimeType;
    }
  } else {
    // JSON — base64 encoded image
    let body: { image?: string; mime_type?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body", message: "Expected JSON or multipart/form-data" }, 400);
    }
    if (!body.image) {
      return c.json({ error: "missing_image", message: "No image field in JSON body" }, 400);
    }
    imageBase64 = body.image;
    if (body.mime_type) mimeType = body.mime_type as typeof mimeType;
  }

  // ── OCR ──────────────────────────────────────────────────────────────────
  let ocrResult: OcrResult;
  try {
    ocrResult = await extractModelPlateOcr(imageBase64, mimeType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scan:${scanId}] OCR error: ${msg}`);
    return c.json(
      { error: "ocr_failed", message: "Could not process image — try a clearer photo", detail: msg },
      502
    );
  }

  // ── Model registry lookup ────────────────────────────────────────────────
  const registryResult = ocrResult.model
    ? await lookupModelRegistry(ocrResult.model, ocrResult.make)
    : {
        found: false,
        match_tier: "none" as const,
        make: null, model_number: null, appliance_type: null,
        manufacture_year_min: null, manufacture_year_max: null,
        recall_status: "unknown" as const,
        cpsc_recall_ids: [], recall_url: null, registry_id: null,
      };

  const elapsed = Date.now() - startedAt;

  // ── Audit log ────────────────────────────────────────────────────────────
  // Non-blocking — log failure doesn't fail the request
  supabase
    .from("scan_audit_log")
    .insert({
      scan_id: scanId,
      ocr_raw_make: ocrResult.make,
      ocr_raw_model: ocrResult.model,
      ocr_raw_serial: ocrResult.serial,
      ocr_raw_text: ocrResult.raw_text,
      registry_match_tier: registryResult.match_tier,
      registry_id: registryResult.registry_id,
      low_contrast_warning: ocrResult.low_contrast_warning,
      elapsed_ms: elapsed,
    })
    .then(({ error }) => {
      if (error) console.warn(`[scan:${scanId}] audit log failed: ${error.message}`);
    });

  // ── Response ─────────────────────────────────────────────────────────────
  return c.json({
    scan_id: scanId,
    ocr: ocrResult,
    registry: registryResult,
    // Broker MUST confirm — always true per OAQ-01 findings
    requires_confirmation: true,
    low_contrast_warning: ocrResult.low_contrast_warning ?? false,
    elapsed_ms: elapsed,
  });
});
