/**
 * routes/public-intake.test.ts — A2 intake token routes (public)
 *
 * Drives GET /intake/public/:token and POST /intake/public/:token/diagnostic
 * with the Supabase module mocked, proving: token resolution, expiry
 * semantics (410), guest session creation, and idempotency.
 * Run with: bun test src/routes/public-intake.test.ts
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Setup BEFORE importing the router (ESM hoisting)
// ─────────────────────────────────────────────────────────────────────────────
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const TOKEN = "aabbccddeeff.TOKEN1234567890abcdefghij";
const EXPIRED_TOKEN = "ffeeddccbbaa.TOKEN1234567890abcdefghij";
const INTAKE_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";

const now = new Date();
const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
const inPast = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

let intakeTable: Record<string, unknown>[];
let insertedSessions: Record<string, unknown>[];
let intakeUpdates: Record<string, unknown>[];

const fakeSupabase = {
  from: (table: string) => {
    if (table === "work_order_intake") {
      return {
        select: () => ({
          eq: (field: string, value: unknown) => ({
            maybeSingle: async () => {
              const row = intakeTable.find((r) => r[field] === value);
              return row ? { data: row, error: null } : { data: null, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            intakeUpdates.push(patch);
            return {};
          },
        }),
      };
    }
    if (table === "diagnostic_sessions") {
      return {
        insert: (row: Record<string, unknown>) => {
          insertedSessions.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: SESSION_ID }, error: null }),
            }),
          };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};

mock.module("../lib/supabase.js", () => ({ supabase: fakeSupabase }));

const { publicRouter } = await import("./public.js");

beforeEach(() => {
  intakeTable = [
    {
      id: INTAKE_ID,
      category: "appliance",
      appliance_type: "refrigerator",
      title: "Fridge not cooling",
      description: "Warmer than usual, food at risk.",
      created_at: now.toISOString(),
      token_expires_at: in24h,
      opened_at: null,
      token: TOKEN,
      diagnostic_session_id: null,
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      category: "appliance",
      appliance_type: "washer",
      title: "Washer leaks",
      description: null,
      created_at: now.toISOString(),
      token_expires_at: inPast,
      opened_at: null,
      token: EXPIRED_TOKEN,
      diagnostic_session_id: null,
    },
  ];
  insertedSessions = [];
  intakeUpdates = [];
});

function get(path: string) {
  return publicRouter.request(path, { method: "GET" });
}
function post(path: string) {
  return publicRouter.request(path, { method: "POST" });
}

describe("GET /api/v1/intake/public/:token", () => {
  it("resolves a live token with PII-safe fields", async () => {
    const res = await get(`/intake/public/${TOKEN}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.intake_id).toBe(INTAKE_ID);
    expect(json.title).toBe("Fridge not cooling");
    expect(json.appliance_type).toBe("refrigerator");
    expect(json.opened_at).toBeNull();
    expect(json.tenant_phone).toBeUndefined();
    expect(json.tenant_name).toBeUndefined();
  });

  it("returns 410 for an expired token", async () => {
    const res = await get(`/intake/public/${EXPIRED_TOKEN}`);
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toBe("expired");
  });

  it("returns 404 for an unknown token", async () => {
    const res = await get("/intake/public/unknown.token");
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("not_found");
  });
});

describe("POST /api/v1/intake/public/:token/diagnostic", () => {
  it("creates a guest session and stamps the intake (201)", async () => {
    const res = await post(`/intake/public/${TOKEN}/diagnostic`);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ intake_id: INTAKE_ID, session_id: SESSION_ID, already_started: false });
    expect(insertedSessions).toHaveLength(1);
    expect(insertedSessions[0]).toMatchObject({
      user_id: null,
      intake_id: INTAKE_ID,
      symptom: "Fridge not cooling",
    });
    expect(intakeUpdates).toHaveLength(1);
    expect(intakeUpdates[0]).toMatchObject({ diagnostic_session_id: SESSION_ID });
    expect(intakeUpdates[0].opened_at).toBeTruthy();
  });

  it("is idempotent — returns the existing session when already started", async () => {
    intakeTable[0].diagnostic_session_id = SESSION_ID;
    intakeTable[0].opened_at = now.toISOString();
    const res = await post(`/intake/public/${TOKEN}/diagnostic`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ intake_id: INTAKE_ID, session_id: SESSION_ID, already_started: true });
    expect(insertedSessions).toHaveLength(0); // no duplicate session
  });

  it("rejects an expired token with 410", async () => {
    const res = await post(`/intake/public/${EXPIRED_TOKEN}/diagnostic`);
    expect(res.status).toBe(410);
    expect(insertedSessions).toHaveLength(0);
  });

  it("rejects an unknown token with 404", async () => {
    const res = await post("/intake/public/unknown.token/diagnostic");
    expect(res.status).toBe(404);
    expect(insertedSessions).toHaveLength(0);
  });
});
