/**
 * lib/property-meld/types.ts — Property Meld integration contract (A1 / E1)
 *
 * OQ-01 status: sandbox NOT yet available (P4 pending). We build against a
 * CONTRACT-SHAPED MOCK (see mock.ts). These types are the agreed contract;
 * when the real sandbox arrives, only the client adapter changes — the
 * webhook handler, intake table, and SMS flow stay as-is.
 *
 * Contract source: homeops-app-development-document-v1.0.md §A1 + E1 +
 * partnership ask (2026-08-20). Field names are our best contract guess,
 * documented as such; every field marked [ASSUMED] must be verified against
 * the real Property Meld webhook schema when it lands.
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

/** Event types we subscribe to (A1: work_order.created + status updates). */
export const PROPERTY_MELD_EVENTS = [
  "work_order.created",
  "work_order.updated",
] as const;
export type PropertyMeldEventType = (typeof PROPERTY_MELD_EVENTS)[number];

/**
 * Property Meld work-order event payload [ASSUMED schema].
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
  event_type: PropertyMeldEventType;
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
