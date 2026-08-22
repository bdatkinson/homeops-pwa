/**
 * routes/safety.ts — Deterministic Safety Kernel endpoint (Rev 4.1)
 *
 * POST /api/v1/safety/evaluate
 *   Body: { applianceType, signals, exclusions }
 *   Returns the canonical disposition + required checks.
 *
 * This is the FIRST call in the triage pipeline. The LLM (Socratic triage)
 * is only allowed to operate WITHIN the disposition the kernel returns:
 *   - EMERGENCY_STOP / PROFESSIONAL_REQUIRED → no consumer action, LLM may
 *     only explain why and route to dispatch
 *   - CONSUMER_CONDITIONAL → LLM may guide ONLY after requiredChecks pass
 *   - CONSUMER_ROUTINE → LLM may guide freely
 * The kernel NEVER delegates authorization to the model (Trust #8).
 */

import { Hono } from "hono";
import { evaluateCase, HARD_EXCLUSIONS } from "../lib/safety-kernel.js";

export const safetyRouter = new Hono();

safetyRouter.post("/evaluate", async (c) => {
  let body: {
    applianceType?: string;
    signals?: string[];
    exclusions?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Expected JSON body" }, 400);
  }

  const applianceType = (body.applianceType ?? "").toString().trim();
  if (!applianceType) {
    return c.json(
      { error: "missing_field", message: "applianceType is required" },
      400
    );
  }

  const signals = Array.isArray(body.signals)
    ? body.signals.map((s) => s.toString()).filter(Boolean)
    : [];

  const exclusions = Array.isArray(body.exclusions)
    ? body.exclusions.filter((e): e is (typeof HARD_EXCLUSIONS)[number] =>
        (HARD_EXCLUSIONS as readonly string[]).includes(e)
      )
    : [];

  const result = evaluateCase({ applianceType, signals, exclusions });

  return c.json({
    disposition: result.disposition,
    requiredChecks: result.requiredChecks,
    matchedSignals: result.matchedSignals,
    allowsConsumerAction:
      result.disposition === "CONSUMER_ROUTINE" ||
      result.disposition === "CONSUMER_CONDITIONAL",
    // Machine-readable safety gate for the triage engine
    gate: {
      llm_scope:
        result.disposition === "EMERGENCY_STOP"
          ? "explain_stop_only"
          : result.disposition === "PROFESSIONAL_REQUIRED"
            ? "explain_and_dispatch"
            : result.disposition === "CONSUMER_CONDITIONAL"
              ? "guide_after_checks"
              : result.disposition === "CONSUMER_ROUTINE"
                ? "guide"
                : "observe_only",
    },
  });
});
