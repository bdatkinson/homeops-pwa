-- ============================================================
-- HomeOps — Migration: work_order_intake (A1 SMS funnel)
-- Built against the contract-shaped Property Meld mock (OQ-01 pending).
-- Stores every appliance work-order trigger + the single-purpose token
-- so the funnel is idempotent, traceable, and demoable without sandbox.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_order_intake (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL DEFAULT 'property_meld',

  -- Provider-side identifiers (business keys, not FKs into our tables)
  work_order_id     TEXT NOT NULL,
  property_id       TEXT NOT NULL,
  unit_id           TEXT NOT NULL,
  category          TEXT NOT NULL,

  -- Ticket content (no PII in URLs — stored here only)
  title             TEXT NOT NULL,
  description       TEXT,
  tenant_name       TEXT,
  tenant_phone      TEXT,
  appliance_type    TEXT,

  -- Event + token lifecycle
  event_type        TEXT NOT NULL DEFAULT 'work_order.created'
                    CHECK (event_type IN ('work_order.created', 'work_order.updated')),
  token             TEXT,
  token_expires_at  TIMESTAMPTZ,
  sms_sid           TEXT,
  sms_status        TEXT,
  sms_mocked        BOOLEAN NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_work_order_intake_wo_id
  ON public.work_order_intake(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_intake_token
  ON public.work_order_intake(token);
CREATE INDEX IF NOT EXISTS idx_work_order_intake_property
  ON public.work_order_intake(property_id, unit_id);

-- Unique: one intake per work order per created event (idempotent retries)
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_order_intake_wo_event
  ON public.work_order_intake(work_order_id, event_type);

-- updated_at trigger
CREATE OR REPLACE TRIGGER work_order_intake_updated_at
  BEFORE UPDATE ON public.work_order_intake
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: service-role writes; no direct consumer access (gateway mediates)
ALTER TABLE public.work_order_intake ENABLE ROW LEVEL SECURITY;

-- Consumers never read/write intake rows directly; broker PMs may read
-- intake for their properties (E2 live triage feed) once joined to
-- properties they own. Tighten when the E-path ownership join lands.
CREATE POLICY "broker_pm_read_own_property_intake" ON public.work_order_intake
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = work_order_intake.property_id
        AND p.created_by = auth.uid()
    )
  );
