-- ============================================================
-- HomeOps — Migration: Property Meld directory sync (E1 prep)
-- Inbound 4-hour sync mirrors PM's core directory entities so the
-- A-path can resolve tenant phone/unit from a Meld event and the
-- E-path can build the PM dashboard without round-tripping to PM.
-- Field names mirror the documented PMS sync mapping (2026-08-22).
-- These are PROVIDER MIRRORS keyed by PM's string ids — HomeOps
-- native domain tables (properties, passports) join separately.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pm_properties (
  pm_property_id            TEXT PRIMARY KEY,
  address_line_1            TEXT,
  address_line_2            TEXT,
  city                      TEXT,
  state                     TEXT,
  zip                       TEXT,
  year_built                INTEGER,
  maintenance_limit         NUMERIC(12,2),
  property_maintenance_notes TEXT,
  property_groups           JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw                       JSONB,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_units (
  pm_unit_id                TEXT PRIMARY KEY,
  pm_property_id            TEXT NOT NULL REFERENCES public.pm_properties(pm_property_id) ON DELETE CASCADE,
  unit_number               TEXT,
  address_line_1            TEXT,
  address_line_2            TEXT,
  city                      TEXT,
  state                     TEXT,
  zip                       TEXT,
  unit_maintenance_notes    TEXT,
  raw                       JSONB,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pm_units_property ON public.pm_units(pm_property_id);

CREATE TABLE IF NOT EXISTS public.pm_residents (
  pm_resident_id            TEXT PRIMARY KEY,
  pm_property_id            TEXT,
  pm_unit_id                TEXT,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT,
  phone                     TEXT,
  status                    TEXT,  -- active | past | future (determines maintenance request rights)
  raw                       JSONB,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pm_residents_unit ON public.pm_residents(pm_unit_id);
CREATE INDEX IF NOT EXISTS idx_pm_residents_phone ON public.pm_residents(phone);

CREATE TABLE IF NOT EXISTS public.pm_owners (
  pm_owner_id               TEXT PRIMARY KEY,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT,
  phone                     TEXT,
  associated_properties     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of PM property ids
  raw                       JSONB,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync bookkeeping: last successful sync per direction (inbound 4h / outbound instant)
CREATE TABLE IF NOT EXISTS public.pm_sync_state (
  direction                 TEXT PRIMARY KEY,  -- 'inbound_directory' | 'outbound_events'
  last_synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_counts             JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- RLS: gateway (service role) writes; no direct consumer access.
ALTER TABLE public.pm_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_sync_state ENABLE ROW LEVEL SECURITY;
