/**
 * lib/property-meld/sync.ts — inbound directory sync normalization (E1 prep)
 *
 * Pure, side-effect free mapping from the documented Property Meld
 * directory sync payload (properties / units / residents / owners,
 * 4-hour cadence) into the pm_* mirror tables.
 *
 * Field names follow the documented PMS mapping (2026-08-22); unknown
 * keys are preserved under `raw` so nothing is lost when the real
 * sandbox schema differs.
 */

import type {
  PmDirectorySync,
  PmProperty,
  PmUnit,
  PmResident,
  PmOwner,
} from "./types.js";

export interface NormalizedDirectorySync {
  properties: PmProperty[];
  units: PmUnit[];
  residents: PmResident[];
  owners: PmOwner[];
  synced_at: string;
}

/** Coerce a payload into the normalized directory sync model. */
export function normalizeDirectorySync(raw: unknown): NormalizedDirectorySync {
  const sync = (raw ?? {}) as Partial<PmDirectorySync>;
  const props = Array.isArray(sync.properties) ? sync.properties : [];
  const units = Array.isArray(sync.units) ? sync.units : [];
  const residents = Array.isArray(sync.residents) ? sync.residents : [];
  const owners = Array.isArray(sync.owners) ? sync.owners : [];

  return {
    properties: props.map((p) => normalizeProperty(p)),
    units: units.map((u) => normalizeUnit(u)),
    residents: residents.map((r) => normalizeResident(r)),
    owners: owners.map((o) => normalizeOwner(o)),
    synced_at: typeof sync.synced_at === "string" ? sync.synced_at : new Date().toISOString(),
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function normalizeProperty(p: Partial<PmProperty>): PmProperty {
  return {
    pm_property_id: str(p.pm_property_id) ?? "",
    address_line_1: str(p.address_line_1),
    address_line_2: str(p.address_line_2),
    city: str(p.city),
    state: str(p.state),
    zip: str(p.zip),
    year_built: num(p.year_built),
    maintenance_limit: num(p.maintenance_limit),
    property_maintenance_notes: str(p.property_maintenance_notes),
    property_groups: Array.isArray(p.property_groups) ? p.property_groups.map(String) : [],
  };
}

export function normalizeUnit(u: Partial<PmUnit>): PmUnit {
  return {
    pm_unit_id: str(u.pm_unit_id) ?? "",
    pm_property_id: str(u.pm_property_id) ?? "",
    unit_number: str(u.unit_number),
    address_line_1: str(u.address_line_1),
    address_line_2: str(u.address_line_2),
    city: str(u.city),
    state: str(u.state),
    zip: str(u.zip),
    unit_maintenance_notes: str(u.unit_maintenance_notes),
  };
}

export function normalizeResident(r: Partial<PmResident>): PmResident {
  const status = str(r.status)?.toLowerCase();
  return {
    pm_resident_id: str(r.pm_resident_id) ?? "",
    pm_property_id: str(r.pm_property_id),
    pm_unit_id: str(r.pm_unit_id),
    first_name: str(r.first_name),
    last_name: str(r.last_name),
    email: str(r.email),
    phone: str(r.phone),
    status: status === "active" || status === "past" || status === "future" ? status : undefined,
  };
}

export function normalizeOwner(o: Partial<PmOwner>): PmOwner {
  return {
    pm_owner_id: str(o.pm_owner_id) ?? "",
    first_name: str(o.first_name),
    last_name: str(o.last_name),
    email: str(o.email),
    phone: str(o.phone),
    associated_properties: Array.isArray(o.associated_properties)
      ? o.associated_properties.map(String)
      : [],
  };
}
