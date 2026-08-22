/**
 * lib/property-meld/sync.test.ts — directory sync normalizer tests
 * Run with: bun test src/lib/property-meld/sync.test.ts
 */
import { describe, expect, it } from "bun:test";
import { normalizeDirectorySync, normalizeProperty, normalizeResident } from "./sync";
import { fixtureDirectorySync } from "./mock";

describe("directory sync normalizer (documented PM schema)", () => {
  it("normalizes the full fixture with correct counts", () => {
    const sync = normalizeDirectorySync(fixtureDirectorySync());
    expect(sync.properties).toHaveLength(2);
    expect(sync.units).toHaveLength(2);
    expect(sync.residents).toHaveLength(2);
    expect(sync.owners).toHaveLength(1);
  });

  it("maps documented property fields", () => {
    const sync = normalizeDirectorySync(fixtureDirectorySync());
    const p = sync.properties[0];
    expect(p.pm_property_id).toBe("prop_001");
    expect(p.address_line_1).toBe("2210 Maple St");
    expect(p.city).toBe("Lexington");
    expect(p.state).toBe("KY");
    expect(p.zip).toBe("40507");
    expect(p.year_built).toBe(2004);
    expect(p.maintenance_limit).toBe(500);
    expect(p.property_groups).toEqual(["Maple Portfolio"]);
  });

  it("keeps resident status lowercase and valid", () => {
    const sync = normalizeDirectorySync(fixtureDirectorySync());
    expect(sync.residents[0].status).toBe("active");
    expect(sync.residents[1].status).toBe("future");
  });

  it("tolerates missing arrays", () => {
    const sync = normalizeDirectorySync({ event: "directory.sync", synced_at: "x" });
    expect(sync.properties).toEqual([]);
    expect(sync.units).toEqual([]);
    expect(sync.residents).toEqual([]);
    expect(sync.owners).toEqual([]);
    expect(sync.synced_at).toBe("x");
  });

  it("coerces string numbers to numeric", () => {
    expect(normalizeProperty({ pm_property_id: "p1", maintenance_limit: "250.5" as never }).maintenance_limit).toBe(250.5);
  });

  it("drops invalid resident status", () => {
    const r = normalizeResident({ pm_resident_id: "r1", status: "ASDF" as never });
    expect(r.status).toBeUndefined();
  });

  it("normalizes phone as-is (no mangling)", () => {
    const sync = normalizeDirectorySync(fixtureDirectorySync());
    expect(sync.residents[0].phone).toBe("+15550111001");
  });
});
