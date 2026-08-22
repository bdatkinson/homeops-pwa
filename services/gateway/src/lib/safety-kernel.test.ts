/**
 * lib/safety-kernel.test.ts — Deterministic Safety Kernel tests (Rev 4.1)
 *
 * The kernel is the moat: these tests prove the fail-closed behavior.
 * Run with: bun test src/lib/safety-kernel.test.ts
 */
import { describe, expect, it } from "bun:test";
import {
  allowsConsumerAction,
  DISPOSITION_ORDER,
  evaluateCase,
  HARD_EXCLUSIONS,
  isEmergencyStop,
  isInsufficientEvidence,
  mostRestrictive,
} from "./safety-kernel";

describe("mostRestrictive (fail-closed ordering)", () => {
  it("orders EMERGENCY_STOP above everything", () => {
    expect(
      mostRestrictive(["CONSUMER_ROUTINE", "PROFESSIONAL_REQUIRED", "EMERGENCY_STOP"])
    ).toBe("EMERGENCY_STOP");
  });

  it("orders PROFESSIONAL_REQUIRED above CONDITIONAL", () => {
    expect(mostRestrictive(["CONSUMER_CONDITIONAL", "PROFESSIONAL_REQUIRED"])).toBe(
      "PROFESSIONAL_REQUIRED"
    );
  });

  it("returns OBSERVATION_ONLY for empty input (safe floor)", () => {
    expect(mostRestrictive([])).toBe("OBSERVATION_ONLY");
  });
});

describe("hard exclusions (fail-closed, no algorithm override)", () => {
  it.each([...HARD_EXCLUSIONS] as const)(
    "exclusion %s always forces PROFESSIONAL_REQUIRED",
    (ex) => {
      const r = evaluateCase({
        applianceType: "washer",
        signals: ["it just stopped mid-cycle"],
        exclusions: [ex],
      });
      expect(r.disposition).toBe("PROFESSIONAL_REQUIRED");
      expect(r.requiredChecks).toContain(`fail_closed_exclusion:${ex}`);
    }
  );
});

describe("signal lexicon", () => {
  it("gas smell → EMERGENCY_STOP regardless of appliance", () => {
    const r = evaluateCase({
      applianceType: "oven",
      signals: ["i smell gas near the stove"],
      exclusions: [],
    });
    expect(r.disposition).toBe("EMERGENCY_STOP");
  });

  it("smoke/arcing → EMERGENCY_STOP", () => {
    const r = evaluateCase({
      applianceType: "dryer",
      signals: ["burning smell and smoke"],
      exclusions: [],
    });
    expect(r.disposition).toBe("EMERGENCY_STOP");
  });

  it("refrigerant mention → PROFESSIONAL_REQUIRED with EPA 608 check", () => {
    const r = evaluateCase({
      applianceType: "refrigerator",
      signals: ["not cooling, might need freon"],
      exclusions: [],
    });
    expect(r.disposition).toBe("PROFESSIONAL_REQUIRED");
    expect(r.requiredChecks).toContain("epa_608_certification_required");
  });

  it("magnetron/high-voltage → PROFESSIONAL_REQUIRED (microwave HV)", () => {
    const r = evaluateCase({
      applianceType: "microwave",
      signals: ["stopped heating, maybe the magnetron is dead"],
      exclusions: [],
    });
    expect(r.disposition).toBe("PROFESSIONAL_REQUIRED");
  });

  it("filter/pump → CONSUMER_CONDITIONAL with water containment + power checks", () => {
    const r = evaluateCase({
      applianceType: "washer",
      signals: ["clogged pump filter"],
      exclusions: [],
    });
    expect(r.disposition).toBe("CONSUMER_CONDITIONAL");
    expect(r.requiredChecks).toContain("water_containment_ready");
    expect(r.requiredChecks).toContain("power_disconnected");
  });

  it("control lock reset → CONSUMER_ROUTINE", () => {
    const r = evaluateCase({
      applianceType: "refrigerator",
      signals: ["control lock is on"],
      exclusions: [],
    });
    expect(r.disposition).toBe("CONSUMER_ROUTINE");
  });
});

describe("appliance floor defaults", () => {
  it("vague symptom on a washer SUSPENDS with INSUFFICIENT_EVIDENCE", () => {
    const r = evaluateCase({
      applianceType: "washer",
      signals: ["odd noise"],
      exclusions: [],
    });
    expect(r.disposition).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.requiredChecks).toContain("gather_model_plate_photo");
    expect(r.requiredChecks).toContain("gather_symptom_detail");
  });

  it("no signals at all → INSUFFICIENT_EVIDENCE (cannot route safely)", () => {
    const r = evaluateCase({
      applianceType: "refrigerator",
      signals: [],
      exclusions: [],
    });
    expect(r.disposition).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("water heater floor is CONSUMER_CONDITIONAL (never routine)", () => {
    const r = evaluateCase({
      applianceType: "water_heater",
      signals: ["pilot light out"],
      exclusions: [],
    });
    expect(r.disposition).not.toBe("CONSUMER_ROUTINE");
  });
});

describe("interaction helpers", () => {
  it("only ROUTINE and CONDITIONAL allow consumer action", () => {
    expect(allowsConsumerAction("CONSUMER_ROUTINE")).toBe(true);
    expect(allowsConsumerAction("CONSUMER_CONDITIONAL")).toBe(true);
    expect(allowsConsumerAction("OBSERVATION_ONLY")).toBe(false);
    expect(allowsConsumerAction("INSUFFICIENT_EVIDENCE")).toBe(false);
    expect(allowsConsumerAction("PROFESSIONAL_REQUIRED")).toBe(false);
    expect(allowsConsumerAction("EMERGENCY_STOP")).toBe(false);
  });

  it("EMERGENCY_STOP is always absolute", () => {
    expect(isEmergencyStop("EMERGENCY_STOP")).toBe(true);
    expect(isEmergencyStop("PROFESSIONAL_REQUIRED")).toBe(false);
  });

  it("INSUFFICIENT_EVIDENCE is identifiable by the triage loop", () => {
    expect(isInsufficientEvidence("INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(isInsufficientEvidence("CONSUMER_ROUTINE")).toBe(false);
  });
});

describe("fail-closed precedence: exclusion + benign signal", () => {
  it("a benign signal can never downgrade a hard exclusion", () => {
    const r = evaluateCase({
      applianceType: "refrigerator",
      signals: ["might just need a reset"],
      exclusions: ["SEALED_REFRIGERANT"],
    });
    expect(r.disposition).toBe("PROFESSIONAL_REQUIRED");
  });

  it("a routine signal can never downgrade a gas signal", () => {
    const r = evaluateCase({
      applianceType: "range",
      signals: ["control lock stuck", "smell of gas"],
      exclusions: [],
    });
    expect(r.disposition).toBe("EMERGENCY_STOP");
  });
});
