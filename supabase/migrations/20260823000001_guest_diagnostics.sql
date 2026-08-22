-- ============================================================
-- HomeOps — Migration: guest diagnostics + intake traceability (A2)
-- The A2 PWA landing (https://homeoperator.app/p/<token>) lets a tenant
-- start a diagnostic with NO sign-in — the single-purpose intake token
-- IS the auth. That means diagnostic sessions can now be created without
-- a user_id, and they must link back to the A1 intake row so the funnel
-- is traceable end-to-end: webhook → SMS → link opened → diagnostic.
-- ============================================================

-- 1. Guest sessions: user_id becomes nullable (auth.users FK preserved for
--    signed-in consumers; guest rows are created by the gateway service role
--    and are invisible to anon/authenticated readers under existing RLS).
ALTER TABLE public.diagnostic_sessions ALTER COLUMN user_id DROP NOT NULL;

-- 2. Link a session back to the intake row that triggered it.
ALTER TABLE public.diagnostic_sessions
  ADD COLUMN IF NOT EXISTS intake_id UUID REFERENCES public.work_order_intake(id) ON DELETE SET NULL;

-- 3. Funnel traceability on the intake itself.
ALTER TABLE public.work_order_intake
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnostic_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_intake_id
  ON public.diagnostic_sessions(intake_id);
