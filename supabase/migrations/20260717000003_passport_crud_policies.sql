-- ============================================================
-- HomeOps — Session 6 Migration: Passport CRUD + Service Role Policies
-- Version: 1.0.0  Date: 2026-07-17
-- Adds service_role bypass policies so the Fly.io gateway (which uses
-- the service role key) can write passports, appliances, and properties
-- without being blocked by RLS.
-- ============================================================

-- ============================================================
-- PROPERTIES — service_role full access
-- ============================================================
DROP POLICY IF EXISTS "properties_service_all" ON public.properties;
CREATE POLICY "properties_service_all" ON public.properties
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- APPLIANCES — service_role full access
-- ============================================================
DROP POLICY IF EXISTS "appliances_service_all" ON public.appliances;
CREATE POLICY "appliances_service_all" ON public.appliances
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PASSPORTS — service_role full access
-- ============================================================
DROP POLICY IF EXISTS "passports_service_all" ON public.passports;
CREATE POLICY "passports_service_all" ON public.passports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PASSPORT_APPLIANCES — service_role full access
-- ============================================================
ALTER TABLE public.passport_appliances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passport_appliances_broker_read" ON public.passport_appliances;
CREATE POLICY "passport_appliances_broker_read" ON public.passport_appliances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.passports
    WHERE id = public.passport_appliances.passport_id
      AND created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "passport_appliances_service_all" ON public.passport_appliances;
CREATE POLICY "passport_appliances_service_all" ON public.passport_appliances
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PASSPORT_INVITES — service_role full access
-- ============================================================
DROP POLICY IF EXISTS "invites_service_all" ON public.passport_invites;
CREATE POLICY "invites_service_all" ON public.passport_invites
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

SELECT 'Session 6 passport CRUD migration complete' AS status;
