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
  PropertyMeldMeldEvent,
  PropertyMeldEventType,
  WorkOrderIntake,
  HomeOpsEventType,
  PmDirectorySync,
} from "./types.js";
import { APPLIANCE_CATEGORIES, toHomeOpsEventType } from "./types.js";

/** Client interface the A1 handler depends on. */
export interface PropertyMeldClient {
  /** Provider name for logging / telemetry. */
  readonly provider: string;
  /** Verify a webhook payload is authentic (no-op in mock; HMAC in real). */
  verifySignature(payload: unknown, signature?: string): boolean;
  /** Normalize a provider event into the HomeOps intake model. */
  normalizeEvent(raw: unknown): WorkOrderIntake;
}

/**
 * Derive the normalized intake from a raw Property Meld event.
 * Tolerant of TWO shapes:
 *  A) flat contract shape (work_order_id / property_id / primary_contact)
 *  B) nested meld shape — meld + resident + property + unit objects using
 *     the documented PMS field names (likely the REAL payload)
 */
export function normalizeEvent(raw: unknown): WorkOrderIntake {
  const hasMeld = typeof raw === "object" && raw !== null && "meld" in (raw as object);
  if (hasMeld) {
    return normalizeMeldEvent(raw as PropertyMeldMeldEvent);
  }
  const e = raw as Partial<PropertyMeldWorkOrderEvent>;
  const eventType: HomeOpsEventType = toHomeOpsEventType(e.event);
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

/** Normalize the nested meld shape into the intake model. */
function normalizeMeldEvent(e: PropertyMeldMeldEvent): WorkOrderIntake {
  const meld = e.meld ?? {};
  const resident = e.resident ?? {};
  const property = e.property ?? {};
  const unit = e.unit ?? {};
  const fullName = [resident.first_name, resident.last_name].filter(Boolean).join(" ").trim();

  return {
    provider: "property_meld",
    work_order_id: String(meld.id ?? ""),
    property_id: String(property.pm_property_id ?? property.address_line_1 ?? ""),
    unit_id: String(unit.pm_unit_id ?? unit.unit_number ?? ""),
    category: String(meld.category ?? ""),
    title: String(meld.title ?? ""),
    description: meld.description?.trim() || null,
    tenant_name: fullName || null,
    tenant_phone: resident.phone?.trim() || null,
    appliance_type: null, // resolved later via the unit registry (E4)
    event_type: toHomeOpsEventType(e.event),
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
      phone: "+15550111001",
      email: "jordan@example.com",
    },
    created_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

/**
 * Fixture for the LIKELY REAL Property Meld shape: a meld event carrying
 * nested resident / property / unit objects with the documented field names.
 */
export function fixtureMeldCreated(overrides: Partial<PropertyMeldMeldEvent> = {}): PropertyMeldMeldEvent {
  const base: PropertyMeldMeldEvent = {
    event: "meld.created",
    meld: {
      id: `MELD-${Math.floor(100000 + Math.random() * 899999)}`,
      category: "appliance",
      title: "Dryer not heating",
      description: "Clothes come out cold after a full cycle.",
      created_at: new Date().toISOString(),
    },
    resident: {
      pm_resident_id: "res_901",
      first_name: "Jordan",
      last_name: "Tenant",
      email: "jordan@example.com",
      phone: "+15550111001",
      status: "active",
    },
    property: {
      pm_property_id: "prop_001",
      address_line_1: "2210 Maple St",
      city: "Lexington",
      state: "KY",
      zip: "40507",
    },
    unit: {
      pm_unit_id: "unit_042",
      pm_property_id: "prop_001",
      unit_number: "42",
    },
  };
  return { ...base, ...overrides };
}

/** Fixture for the inbound 4-hour directory sync (documented schema). */
export function fixtureDirectorySync(overrides: Partial<PmDirectorySync> = {}): PmDirectorySync {
  const base: PmDirectorySync = {
    event: "directory.sync",
    synced_at: new Date().toISOString(),
    properties: [
      {
        pm_property_id: "prop_001",
        address_line_1: "2210 Maple St",
        city: "Lexington",
        state: "KY",
        zip: "40507",
        year_built: 2004,
        maintenance_limit: 500,
        property_maintenance_notes: "HOA approval required for exterior work.",
        property_groups: ["Maple Portfolio"],
      },
      {
        pm_property_id: "prop_002",
        address_line_1: "88 Oak Ave",
        city: "Lexington",
        state: "KY",
        zip: "40502",
        year_built: 1998,
        maintenance_limit: 350,
        property_groups: [],
      },
    ],
    units: [
      {
        pm_unit_id: "unit_042",
        pm_property_id: "prop_001",
        unit_number: "42",
        address_line_1: "2210 Maple St",
        city: "Lexington",
        state: "KY",
        zip: "40507",
      },
      {
        pm_unit_id: "unit_101",
        pm_property_id: "prop_002",
        unit_number: "101",
        address_line_1: "88 Oak Ave",
        city: "Lexington",
        state: "KY",
        zip: "40502",
      },
    ],
    residents: [
      {
        pm_resident_id: "res_901",
        pm_property_id: "prop_001",
        pm_unit_id: "unit_042",
        first_name: "Jordan",
        last_name: "Tenant",
        email: "jordan@example.com",
        phone: "+15550111001",
        status: "active",
      },
      {
        pm_resident_id: "res_902",
        pm_property_id: "prop_002",
        pm_unit_id: "unit_101",
        first_name: "Alex",
        last_name: "Renter",
        email: "alex@example.com",
        phone: "+15550111002",
        status: "future",
      },
    ],
    owners: [
      {
        pm_owner_id: "own_007",
        first_name: "Pat",
        last_name: "Owner",
        email: "pat@example.com",
        phone: "+15550111007",
        associated_properties: ["prop_001", "prop_002"],
      },
    ],
  };
  return { ...base, ...overrides };
}

/** Fixture for the outbound invoice-approved event (financial object). */
export function fixtureInvoiceApproved(overrides: Record<string, unknown> = {}) {
  return {
    event: "invoice.approved",
    invoice_id: "INV-2026-0001",
    vendor_id: "ven_311",
    meld_id: "MELD-100123",
    amount: 214.5,
    description: "Replaced dishwasher drain pump",
    attachment_url: "https://pm.example.com/invoices/INV-2026-0001.pdf",
    ...overrides,
  };
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
