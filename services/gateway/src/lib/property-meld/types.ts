/**
 * lib/property-meld/types.ts — Property Meld integration contract (A1 / E1)
 *
 * OQ-01 status: sandbox NOT yet available (P4 pending). We build against a
 * CONTRACT-SHAPED MOCK (see mock.ts). These types are the agreed contract;
 * when the real sandbox arrives, only the client adapter changes — the
 * webhook handler, intake table, and SMS flow stay as-is.
 *
 * Contract source: homeops-app-development-document-v1.0.md §A1 + E1 +
 * partnership ask (2026-08-20), UPDATED 2026-08-22 with the documented
 * PMS sync mapping (Rentvine/Propertyware field names) — see
 * docs/planning/property-meld-integration-v1.md. Field names marked
 * [ASSUMED] must be verified against the real Property Meld webhook
 * schema when it lands; the normalizer is deliberately tolerant of both
 * the flat contract shape and the nested meld/resident/property shape.
 */

/** Appliance categories that trigger the SMS funnel (A1 rule 1). */
export const APPLIANCE_CATEGORIES = [
  "appliance",
  "appliances",
  "kitchen_appliance",
  "laundry_appliance",
  "major_appliance",
] as const;
export type ApplianceCategory = (typeof APPLIANCE_CATEGORIES)[number];

/**
 * Provider event names. Property Meld's public vocabulary calls tickets
 * "Melds"; the PMS sync mapping documents work-order style events. We
 * accept both and normalize to the internal event_type below.
 */
export const PROPERTY_MELD_EVENTS = [
  "work_order.created",
  "work_order.updated",
  "meld.created",
  "meld.updated",
  "invoice.approved",
] as const;
export type PropertyMeldEventType = (typeof PROPERTY_MELD_EVENTS)[number];

/** HomeOps internal event vocabulary (after normalization). */
export const HOMEOPS_EVENTS = ["work_order.created", "work_order.updated"] as const;
export type HomeOpsEventType = (typeof HOMEOPS_EVENTS)[number];

/** Map a provider event name to the internal vocabulary. */
export function toHomeOpsEventType(event?: string): HomeOpsEventType {
  if (event === "work_order.updated" || event === "meld.updated") return "work_order.updated";
  return "work_order.created"; // work_order.created, meld.created, unknown → created
}

/**
 * Property Meld work-order event payload (flat contract shape).
 * The webhook body is expected to carry the work order + minimal context.
 */
export interface PropertyMeldWorkOrderEvent {
  event: PropertyMeldEventType;
  /** Property Meld work-order id — the stable business key. */
  work_order_id: string;
  property_id: string;
  unit_id: string;
  category: string;
  /** What the tenant reported, free text. */
  title: string;
  description?: string;
  /** Tenant contact for the SMS. [ASSUMED: primary_contact may be nested] */
  primary_contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  /** Legacy flat phone field, if the webhook delivers it this way. */
  tenant_phone?: string;
  /** Set when the unit registry is pre-seeded (E4). [ASSUMED] */
  appliance_type?: string;
  created_at: string;
  /** Provider signature; verified when the real schema lands. */
  signature?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documented PMS sync entities (2026-08-22) — Property Meld directory mirror
// ─────────────────────────────────────────────────────────────────────────────

export interface PmProperty {
  pm_property_id: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  year_built?: number;
  maintenance_limit?: number;
  property_maintenance_notes?: string;
  property_groups?: string[];
}

export interface PmUnit {
  pm_unit_id: string;
  pm_property_id: string;
  unit_number?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  unit_maintenance_notes?: string;
}

export type ResidentStatus = "active" | "past" | "future";

export interface PmResident {
  pm_resident_id: string;
  pm_property_id?: string;
  pm_unit_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: ResidentStatus; // active|past|future — determines maintenance request rights
}

export interface PmOwner {
  pm_owner_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  associated_properties?: string[]; // array of PM property ids
}

/** Inbound directory sync payload (4-hour cadence per the sync model). */
export interface PmDirectorySync {
  event: "directory.sync";
  synced_at: string;
  properties: PmProperty[];
  units: PmUnit[];
  residents: PmResident[];
  owners: PmOwner[];
}

/** Outbound financial event (invoice approved by manager → instant trigger). */
export interface PmInvoiceApproved {
  event: "invoice.approved";
  invoice_id: string;
  vendor_id: string;
  /** Original maintenance ticket reference. */
  meld_id: string;
  amount: number;
  description: string;
  attachment_url: string;
}

/**
 * Nested meld webhook shape — the likely REAL Property Meld payload:
 * the meld (ticket) carries a resident, property, and unit object using
 * the documented field names. [ASSUMED structure — see mapping doc]
 */
export interface PropertyMeldMeldEvent {
  event: PropertyMeldEventType; // typically meld.created / meld.updated
  meld: {
    id: string;
    category?: string;
    title?: string;
    description?: string;
    created_at?: string;
  };
  resident?: Partial<PmResident>;
  property?: Partial<PmProperty>;
  unit?: Partial<PmUnit>;
  signature?: string;
}

/** Normalized intake model — what HomeOps stores regardless of provider shape. */
export interface WorkOrderIntake {
  provider: "property_meld";
  work_order_id: string;
  property_id: string;
  unit_id: string;
  category: string;
  title: string;
  description: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  appliance_type: string | null;
  event_type: HomeOpsEventType;
  received_at: string;
}

/** Classification result from the A1 eligibility filter. */
export interface WorkOrderClassification {
  eligible: boolean;
  reason:
    | "appliance_category"
    | "not_appliance_category"
    | "missing_tenant_phone"
    | "not_work_order_created";
}

/** Short-TTL, single-purpose intake token (A1 rule 4 — no PII in URL). */
export interface IntakeToken {
  token: string;
  expires_at: string;
}
