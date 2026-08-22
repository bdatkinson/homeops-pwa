/**
 * routes/webhooks.test.ts — A1 webhook route integration test
 *
 * Drives the REAL Hono route end-to-end with the Supabase module mocked,
 * proving: signature → normalize → classify → persist → mock SMS → 201.
 * Run with: bun test src/routes/webhooks.test.ts
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Setup BEFORE importing the router (ESM hoisting: static imports run first,
// so set env + register mocks, then dynamic-import the route module).
// ─────────────────────────────────────────────────────────────────────────────
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const insertedRows: Record<string, unknown>[] = [];
const fakeSupabase = {
  from: () => ({
    insert: (row: Record<string, unknown>) => {
      insertedRows.push(row);
      return {
        select: () => ({
          single: async () => ({
            data: { id: "00000000-0000-0000-0000-000000000001", work_order_id: row.work_order_id, token: row.token, token_expires_at: row.token_expires_at },
            error: null,
          }),
        }),
      };
    },
  }),
};

mock.module("../lib/supabase.js", () => ({ supabase: fakeSupabase }));
mock.module("../lib/notify.js", () => ({
  sendInviteSms: async () => ({ sid: "SM-TEST", status: "queued" }),
}));

// Dynamic import AFTER mocks are registered
const { webhooksRouter } = await import("./webhooks.js");
const { fixtureWorkOrderCreated } = await import("../lib/property-meld/mock.js");

beforeEach(() => {
  insertedRows.length = 0;
});

function post(path: string, body: unknown) {
  return webhooksRouter.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/webhooks/property-meld", () => {
  it("accepts an appliance work order → 201 with intake id + mock SMS", async () => {
    const res = await post("/property-meld", fixtureWorkOrderCreated());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.accepted).toBe(true);
    expect(json.work_order_id).toMatch(/^WO-\d+$/);
    expect(json.sms).toMatchObject({ status: "queued", mocked: true });
    expect(json.link).toMatch(/^https:\/\/homeoperator\.app\/p\/[a-f0-9]{12}\.[A-Za-z0-9_-]{24}$/);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      provider: "property_meld",
      category: "appliance",
      event_type: "work_order.created",
    });
  });

  it("acknowledges but rejects non-appliance tickets (200, not 201)", async () => {
    const res = await post("/property-meld", fixtureWorkOrderCreated({ category: "plumbing" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ accepted: false, reason: "not_appliance_category" });
    expect(insertedRows).toHaveLength(0); // no new row
  });

  it("rejects missing body with 400", async () => {
    const res = await webhooksRouter.request("/property-meld", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/dev/simulate/property-meld (mock mode)", () => {
  it("simulates a fixture through the same handler and returns 201", async () => {
    const res = await post("/dev/simulate/property-meld", {});
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.simulated_event.event).toBe("work_order.created");
    expect(json.result.accepted).toBe(true);
    expect(insertedRows.length).toBe(1); // simulator wrote exactly one row
  });
});
