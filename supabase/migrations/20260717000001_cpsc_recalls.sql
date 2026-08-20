-- ============================================================
-- HomeOps — Session 3 Migration: CPSC Recalls Table
-- Version: 1.0.1  Date: 2026-07-17
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cpsc_recalls (
  id               SERIAL PRIMARY KEY,
  recall_number    TEXT NOT NULL UNIQUE,
  recall_id        INTEGER,
  recall_date      DATE,
  title            TEXT,
  description      TEXT,
  url              TEXT,
  product_names    TEXT[],
  appliance_types  TEXT[],
  brands           TEXT[],
  hazard_summary   TEXT,
  remedy_options   TEXT[],
  units_affected   TEXT,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cpsc_recalls_brands_idx ON public.cpsc_recalls USING gin(brands);
CREATE INDEX IF NOT EXISTS cpsc_recalls_types_idx  ON public.cpsc_recalls USING gin(appliance_types);
CREATE INDEX IF NOT EXISTS cpsc_recalls_date_idx   ON public.cpsc_recalls(recall_date DESC);

ALTER TABLE public.cpsc_recalls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpsc_recalls_authenticated_read" ON public.cpsc_recalls;
CREATE POLICY "cpsc_recalls_authenticated_read" ON public.cpsc_recalls
  FOR SELECT TO authenticated USING (TRUE);

SELECT 'cpsc_recalls migration complete' AS status;
