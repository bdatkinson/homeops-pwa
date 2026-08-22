/**
 * lib/safety-kernel.ts — HomeOps Deterministic Safety Kernel (Rev 4.1)
 *
 * The canonical case-disposition + hard-exclusion engine. This is the moat:
 * NO language model ever authorizes a physical action. The kernel is a
 * deterministic policy function — pure, testable, fail-closed.
 *
 * Canonical source of truth: GTM Rev 4.1 (2026-08-21) §2 "The 5 Case
 * Dispositions" + "Hard Exclusions (Fail-Closed)". Supersedes the archived
 * broker-first severity model in the old diagnostics.ts.
 */

// ---------------------------------------------------------------------------
// 1. The Case Dispositions (GTM Rev 4.1 + Conversion Plan §Eligibility)
//    Six dispositions: five severity tiers + the plan's suspension state.
// ---------------------------------------------------------------------------

export const DISPOSITIONS = [
  "INSUFFICIENT_EVIDENCE",   // SUSPENSION: cannot route yet — gather observations first
  "OBSERVATION_ONLY",        // inspect, listen, scan model plate, photograph — no physical manipulation
  "CONSUMER_ROUTINE",        // low-risk, fully reversible maintenance (control lock reset, external filter wash)
  "CONSUMER_CONDITIONAL",    // safe only after explicit prerequisite checks pass (washer pump drain w/ containment)
  "PROFESSIONAL_REQUIRED",   // specialized competence, tools, high voltage, or sealed systems
  "EMERGENCY_STOP",          // immediate acute risk — gas smell, arcing, thermal runaway, flood, active CPSC recall
] as const;

export type Disposition = (typeof DISPOSITIONS)[number];

export const DISPOSITION_ORDER: Record<Disposition, number> = {
  // INSUFFICIENT_EVIDENCE sits BELOW every severity tier: it is never the
  // most-restrictive winner when any real signal or exclusion matched.
  INSUFFICIENT_EVIDENCE: -1,
  OBSERVATION_ONLY: 0,
  CONSUMER_ROUTINE: 1,
  CONSUMER_CONDITIONAL: 2,
  PROFESSIONAL_REQUIRED: 3,
  EMERGENCY_STOP: 4,
};

/** The most restrictive of a set of dispositions (fail-closed ordering). */
export function mostRestrictive(d: Disposition[]): Disposition {
  if (d.length === 0) return "OBSERVATION_ONLY";
  return d.reduce((a, b) =>
    DISPOSITION_ORDER[b] > DISPOSITION_ORDER[a] ? b : a
  );
}

// ---------------------------------------------------------------------------
// 2. Hard Exclusions (Fail-Closed) — GTM Rev 4.1 §2
//    No risk algorithm may override these. Five categories, machine-checked.
// ---------------------------------------------------------------------------

export const HARD_EXCLUSIONS = [
  "OPEN_240V_TERMINALS",           // open 240V terminals, live electrical testing, safety-switch jumpering
  "GAS_TRAIN",                     // gas train, burner orifice, regulator, ignition assemblies
  "SEALED_REFRIGERANT",            // sealed refrigerant circuits — EPA Section 608 compliance
  "MICROWAVE_HV",                  // microwave high-voltage capacitors / magnetron assemblies
  "STRUCTURAL_LIFT",               // structural tub, drum suspension, or unassisted heavy appliance lifting
] as const;

export type HardExclusion = (typeof HARD_EXCLUSIONS)[number];

export interface SafetyInput {
  /** Appliance category the case is about. */
  applianceType: string;
  /** Free-text or tokenized symptom signals detected during intake. */
  signals: string[];
  /** True when the case touches one of the five exclusion categories. */
  exclusions: HardExclusion[];
}

const APPLIANCE_DEFAULTS: Record<string, Disposition> = {
  microwave: "CONSUMER_ROUTINE",
  refrigerator: "CONSUMER_ROUTINE",
  freezer: "CONSUMER_ROUTINE",
  dishwasher: "CONSUMER_ROUTINE",
  washer: "CONSUMER_ROUTINE",
  dryer: "CONSUMER_ROUTINE",
  oven: "CONSUMER_ROUTINE",
  range: "CONSUMER_ROUTINE",
  cooktop: "CONSUMER_ROUTINE",
  water_heater: "CONSUMER_CONDITIONAL",
  hvac: "CONSUMER_CONDITIONAL",
  ac_unit: "CONSUMER_CONDITIONAL",
  heat_pump: "CONSUMER_CONDITIONAL",
};

// Signal lexicon → disposition + required prerequisite checks.
// Every entry here is curated by the kernel, never by the LLM.
const SIGNAL_RULES: Array<{ pattern: RegExp; disposition: Disposition; checks?: string[] }> = [
  // EMERGENCY_STOP signals — highest priority, fail-closed
  { pattern: /gas smell|smell gas|smell of gas|rotten egg|mercaptan|gas leak|gas odor/i, disposition: "EMERGENCY_STOP" },
  { pattern: /arcing|spark|sparks|burning smell|smoke|electrical fire/i, disposition: "EMERGENCY_STOP" },
  { pattern: /flood|overflowing|water everywhere|active leak/i, disposition: "EMERGENCY_STOP" },
  { pattern: /thermal runaway|on fire|smoldering/i, disposition: "EMERGENCY_STOP" },
  { pattern: /recall/i, disposition: "EMERGENCY_STOP", checks: ["verify_cpsc_recall_active"] },

  // GAS / sealed systems → PROFESSIONAL_REQUIRED
  { pattern: /gas|propane|natural gas|burner|orifice|regulator|ignition/i, disposition: "PROFESSIONAL_REQUIRED" },
  { pattern: /refrigerant|freon|r-410a|r-134a|r-600a|sealed system|compressor line/i, disposition: "PROFESSIONAL_REQUIRED", checks: ["epa_608_certification_required"] },

  // ELECTRICAL at the panel/240V level → PROFESSIONAL_REQUIRED
  { pattern: /240|220|breaker trip|main panel|hardwired|electrical panel/i, disposition: "PROFESSIONAL_REQUIRED" },

  // HIGH-VOLTAGE microwave internals → PROFESSIONAL_REQUIRED (capacitor can hold lethal charge)
  { pattern: /magnetron|capacitor|high voltage|high-voltage/i, disposition: "PROFESSIONAL_REQUIRED", checks: ["microwave_hv_discharge_required"] },

  // STRUCTURAL → PROFESSIONAL_REQUIRED
  { pattern: /drum|suspension|tub|bearing|basket|heavy lift|lifting/i, disposition: "PROFESSIONAL_REQUIRED" },

  // CONDITIONAL maintenance → CONSUMER_CONDITIONAL with prerequisite checks
  { pattern: /pump|filter|drain|defrost|cleanout/i, disposition: "CONSUMER_CONDITIONAL", checks: ["water_containment_ready", "power_disconnected"] },

  // Routine resets → CONSUMER_ROUTINE
  { pattern: /control lock|child lock|reset|cycle|restart|unplug/i, disposition: "CONSUMER_ROUTINE" },
];

/**
 * Evaluate a case through the deterministic safety kernel.
 *
 * Order of operations (all deterministic, all fail-closed):
 *   1. Hard exclusions present  → EMERGENCY_STOP (or PROFESSIONAL_REQUIRED for
 *      non-immediate hazards like refrigerant) — no algorithm may override.
 *   2. Signal lexicon          → disposition + prerequisite checks.
 *   3. Appliance-type default  → floor disposition.
 *   4. Take the MOST RESTRICTIVE of all matched dispositions.
 *
 * Returns the disposition plus the set of prerequisite checks that MUST pass
 * before any CONSUMER_CONDITIONAL action is authorized.
 */
export function evaluateCase(input: SafetyInput): {
  disposition: Disposition;
  requiredChecks: string[];
  matchedSignals: string[];
} {
  const dispositions: Disposition[] = [];
  const requiredChecks = new Set<string>();
  const matchedSignals: string[] = [];

  // 1. Hard exclusions — absolute, fail-closed
  for (const ex of input.exclusions) {
    switch (ex) {
      case "OPEN_240V_TERMINALS":
      case "GAS_TRAIN":
      case "SEALED_REFRIGERANT":
      case "MICROWAVE_HV":
      case "STRUCTURAL_LIFT":
        dispositions.push("PROFESSIONAL_REQUIRED");
        requiredChecks.add("fail_closed_exclusion:" + ex);
        break;
    }
  }

  // 2. Signal lexicon
  for (const rule of SIGNAL_RULES) {
    for (const signal of input.signals) {
      if (rule.pattern.test(signal)) {
        dispositions.push(rule.disposition);
        matchedSignals.push(signal);
        (rule.checks ?? []).forEach((c) => requiredChecks.add(c));
      }
    }
  }

  // 3. Appliance-type floor
  const floor = APPLIANCE_DEFAULTS[input.applianceType.toLowerCase()];
  if (floor) dispositions.push(floor);

  // 4. Most restrictive wins.
  //    BUT: if nothing informative matched (no exclusions, no signal rule),
  //    we cannot route safely — SUSPEND with INSUFFICIENT_EVIDENCE (the plan's
  //    5th disposition). The triage loop must gather observations (model plate
  //    photo, symptom detail) before any state transition. The appliance floor
  //    alone is never enough to authorize an action on a vague symptom.
  const hasExclusion = input.exclusions.length > 0;
  const hasSignalMatch = matchedSignals.length > 0;
  if (!hasExclusion && !hasSignalMatch) {
    return {
      disposition: "INSUFFICIENT_EVIDENCE",
      requiredChecks: ["gather_model_plate_photo", "gather_symptom_detail"],
      matchedSignals,
    };
  }

  return {
    disposition: mostRestrictive(dispositions),
    requiredChecks: [...requiredChecks],
    matchedSignals,
  };
}

/** True when the disposition allows any consumer physical action at all. */
export function allowsConsumerAction(d: Disposition): boolean {
  return d === "CONSUMER_ROUTINE" || d === "CONSUMER_CONDITIONAL";
}

/** EMERGENCY_STOP is always absolute — no checks, no action, immediate halt. */
export function isEmergencyStop(d: Disposition): boolean {
  return d === "EMERGENCY_STOP";
}

/** INSUFFICIENT_EVIDENCE: traversal suspended — the triage loop must gather
 *  more observations before any state transition (Conversion Plan §Eligibility). */
export function isInsufficientEvidence(d: Disposition): boolean {
  return d === "INSUFFICIENT_EVIDENCE";
}
