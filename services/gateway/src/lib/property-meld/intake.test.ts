/**
 * lib/property-meld/intake.test.ts — A1 funnel logic tests
 * Run with: bun test src/lib/property-meld/intake.test.ts
 */
import { describe, expect, it } from "bun:test";
import { classifyIntake, generateIntakeToken, buildSmsBody, buildIntakeLink, INTAKE_TOKEN_TTL_HOURS } from "./intake";
import { normalizeEvent, fixtureWorkOrderCreated, fixtureEvents } from "./mock";
import { isApplianceCategory } from "./mock";

describe("A1 classification (appliance category filter)", () => {
  it("accepts an appliance work order with tenant phone", () => {
    const intake = normalizeEvent(fixtureWorkOrderCreated());
    const c = classifyIntake(intake);
    expect(c).toEqual({ eligible: true, reason: "appliance_category" });
  });

  it("rejects non-appliance categories (plumbing)", () => {
    const intake = normalizeEvent(fixtureWorkOrderCreated({ category: "plumbing" }));
    expect(classifyIntake(intake)).toEqual({ eligible: false, reason: "not_appliance_category" });
  });

  it("rejects work_order.updated events (no new SMS)", () => {
    const intake = normalizeEvent(fixtureWorkOrderCreated({ event: "work_order.updated" }));
    expect(classifyIntake(intake)).toEqual({ eligible: false, reason: "not_work_order_created" });
  });

  it("rejects missing tenant phone", () => {
    const intake = normalizeEvent(
      fixtureWorkOrderCreated({ tenant_phone: undefined, primary_contact: { name: "No Phone" } })
    );
    expect(classifyIntake(intake)).toEqual({ eligible: false, reason: "missing_tenant_phone" });
  });

  it("accepts flat tenant_phone field", () => {
    const intake = normalizeEvent(
      fixtureWorkOrderCreated({ tenant_phone: "+15551234567", primary_contact: undefined })
    );
    expect(classifyIntake(intake).eligible).toBe(true);
  });

  it("accepts all appliance category synonyms", () => {
    for (const cat of ["appliance", "appliances", "kitchen_appliance", "laundry_appliance", "major_appliance"]) {
      expect(isApplianceCategory(cat)).toBe(true);
    }
    expect(isApplianceCategory("hvac")).toBe(false);
  });

  it("fixtureEvents exercises every branch (2 eligible, 3 rejected)", () => {
    const events = fixtureEvents();
    expect(events).toHaveLength(5);
    const results = events.map((e) => classifyIntake(normalizeEvent(e)));
    expect(results.filter((r) => r.eligible)).toHaveLength(2); // fixture 0 + 4
    expect(results.map((r) => r.reason)).toEqual([
      "appliance_category",
      "not_appliance_category",
      "missing_tenant_phone",
      "not_work_order_created",
      "appliance_category",
    ]);
  });
});

describe("intake token (A1 rule 4 — no PII in URL)", () => {
  it("generates a scoped, expiring token", () => {
    const t = generateIntakeToken("WO-12345");
    expect(t.token).toMatch(/^[a-f0-9]{12}\.[A-Za-z0-9_-]{24}$/);
    const ttlMs = new Date(t.expires_at).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan((INTAKE_TOKEN_TTL_HOURS - 1) * 3600_000);
    expect(ttlMs).toBeLessThanOrEqual(INTAKE_TOKEN_TTL_HOURS * 3600_000 + 5_000);
  });

  it("binds the token scope to the work order (same WO prefix, different random)", () => {
    const a = generateIntakeToken("WO-ABC");
    const b = generateIntakeToken("WO-ABC");
    const c = generateIntakeToken("WO-XYZ");
    expect(a.token.split(".")[0]).toBe(b.token.split(".")[0]); // same WO → same scope
    expect(a.token.split(".")[0]).not.toBe(c.token.split(".")[0]); // different WO → different scope
    expect(a.token).not.toBe(b.token); // random suffix differs
    expect(a.token).not.toBe(c.token);
  });

  it("contains no PII (no phone, email, name, or address)", () => {
    const t = generateIntakeToken("WO-ABC");
    const lower = t.token.toLowerCase();
    for (const pii of ["+1", "jordan", "example.com", "unit", "prop_", "phone"]) {
      expect(lower).not.toContain(pii);
    }
  });
});

describe("SMS body + link", () => {
  it("builds the A1 SMS with appliance label", () => {
    const intake = normalizeEvent(fixtureWorkOrderCreated({ appliance_type: "dishwasher" }));
    const link = buildIntakeLink("https://homeoperator.app", "tok123");
    const body = buildSmsBody(intake, link);
    expect(body).toContain("Take Command: your dishwasher issue is queued.");
    expect(body).toContain("no download");
    expect(body).toContain("https://homeoperator.app/p/tok123");
    expect(body).toContain("Reply STOP to opt out.");
  });

  it("defaults to 'your appliance' when type unknown", () => {
    const intake = normalizeEvent(fixtureWorkOrderCreated({ appliance_type: undefined }));
    const body = buildSmsBody(intake, "https://x/p/t");
    expect(body).toContain("Take Command: your appliance issue is queued.");
    expect(body).not.toContain("your your");
  });

  it("normalizes trailing slash on base URL", () => {
    expect(buildIntakeLink("https://homeoperator.app/", "t")).toBe("https://homeoperator.app/p/t");
  });
});
