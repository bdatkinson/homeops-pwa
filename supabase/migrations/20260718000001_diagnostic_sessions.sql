-- ============================================================
-- HomeOps — Migration: diagnostic_sessions table
-- Session 14 — Backend Enhancements
-- ============================================================

CREATE TABLE IF NOT EXISTS public.diagnostic_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passport_id       UUID REFERENCES public.passports(id) ON DELETE SET NULL,
  appliance_id      UUID REFERENCES public.appliances(id) ON DELETE SET NULL,

  -- The symptom the consumer described
  symptom           TEXT NOT NULL,

  -- AI response snapshot
  summary           TEXT,
  severity          TEXT CHECK (severity IN ('low', 'medium', 'high', 'call_professional')),
  steps             JSONB DEFAULT '[]'::jsonb,
  escalate_message  TEXT,
  disclaimer        TEXT,

  -- Escalation tracking
  escalated_at      TIMESTAMPTZ,
  escalated_to      TEXT,  -- 'email' | 'phone' | null

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_user_id
  ON public.diagnostic_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_passport_id
  ON public.diagnostic_sessions(passport_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_appliance_id
  ON public.diagnostic_sessions(appliance_id);

-- updated_at trigger
CREATE OR REPLACE TRIGGER diagnostic_sessions_updated_at
  BEFORE UPDATE ON public.diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;

-- Consumers can read/write their own sessions only
CREATE POLICY "consumer_own_sessions" ON public.diagnostic_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
