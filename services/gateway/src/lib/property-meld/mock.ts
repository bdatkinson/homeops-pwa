/**
 * lib/property-meld/mock.ts — CONTRACT-SHAPED MOCK of the Property Meld API
 *
 * OQ-01: real sandbox pending (P4). This mock stands in so A1/E1 can be
 * built, tested, and demoed TODAY. It emits realistic work_order.created
 * events against the types in ./types.ts.
 *
 * Swap path: when the real sandbox lands, implement PropertyMeldClient in
 * client.ts using the same normalized types. The webhook handler and the
 * intake table never change.
 */

import type {
  PropertyMeldWorkOrderEvent,
  PropertyMeldEventType,
  WorkOrderIntake,
} from "./types.js";
import { APPLIANCE_CATEGORIES } from "./types.js";

/** Client interface the A1 handler depends on. */
export interface PropertyMeldClient {
  /** Provider name for logging / telemetry. */
  readonly provider: string;
  /** Verify a webhook payload is authentic (no-op in mock; HMAC in real). */
  verifySignature(payload: unknown, signature?: string): boolean;
  /** Normalize a provider event into the HomeOps intake model. */
  normalizeEvent(raw: unknown): WorkOrderIntake;
}

/** Derive the normalized intake from a raw Property Meld event. */
export function normalizeEvent(raw: unknown): WorkOrderIntake {
  const e = raw as Partial<PropertyMeldWorkOrderEvent>;
  const eventType: PropertyMeldEventType =
    e.event === "work_order.updated" ? "work_order.updated" : "work_order.created";
  const tenantPhone =
    e.tenant_phone?.trim() || e.primary_contact?.phone?.trim() || null;
  const tenantName = e.primary_contact?.name?.trim() || null;

  return {
    provider: "property_meld",
    work_order_id: String(e.work_order_id ?? ""),
    property_id: String(e.property_id ?? ""),
    unit_id: String(e.unit_id ?? ""),
    category: String(e.category ?? ""),
    title: String(e.title ?? ""),
    description: e.description?.trim() || null,
    tenant_name: tenantName,
    tenant_phone: tenantPhone,
    appliance_type: e.appliance_type?.trim() || null,
    event_type: eventType,
    received_at: new Date().toISOString(),
  };
}

/** Is the work order in an appliance category (A1 rule 1)? */
export function isApplianceCategory(category: string): boolean {
  const c = category.trim().toLowerCase();
  return (APPLIANCE_CATEGORIES as readonly string[]).includes(c);
}

/** Mock client — verifies nothing, normalizes everything. */
export const mockPropertyMeldClient: PropertyMeldClient = {
  provider: "property_meld_mock",
  verifySignature: () => true,
  normalizeEvent,
};

/** Generate a fixture work_order.created event (appliance category). */
export function fixtureWorkOrderCreated(overrides: Partial<PropertyMeldWorkOrderEvent> = {}): PropertyMeldWorkOrderEvent {
  const base: PropertyMeldWorkOrderEvent = {
    event: "work_order.created",
    work_order_id: `WO-${Math.floor(100000 + Math.random() * 899999)}`,
    property_id: "prop_001",
    unit_id: "unit_042",
    category: "appliance",
    title: "Dishwasher not draining",
    description: "Water standing at the bottom after every cycle.",
    primary_contact: {
      name: "Jordan Tenant",
      phone: "+15551234567",
      email: "jordan@example.com",
    },
    created_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

/** Fixtures for exercising every branch of the A1 filter. */
export function fixtureEvents(): PropertyMeldWorkOrderEvent[] {
  return [
    fixtureWorkOrderCreated(), // 0: eligible appliance
    fixtureWorkOrderCreated({ category: "plumbing" }), // 1: not appliance
    fixtureWorkOrderCreated({ tenant_phone: undefined, primary_contact: { name: "No Phone" } }), // 2: missing phone
    fixtureWorkOrderCreated({ event: "work_order.updated", title: "Status changed" }), // 3: wrong event
    fixtureWorkOrderCreated({ category: "appliance", appliance_type: "washer" }), // 4: appliance + type
  ];
}

/** Log a mock "SMS" — used when Twilio creds aren't wired (mock mode). */
export function logMockSms(toPhone: string, body: string): { sid: string; status: string; mocked: true } {
  const sid = `SM-MOCK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  console.log(`[mock-sms] to=${toPhone} sid=${sid}\n${body}`);
  return { sid, status: "queued", mocked: true };
}
