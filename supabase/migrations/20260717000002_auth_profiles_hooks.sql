-- ============================================================
-- HomeOps — Session 5 Migration: Auth + Profiles Hooks
-- Version: 1.0.0  Date: 2026-07-17
-- Implements:
--   1. handle_new_user()  — on INSERT auth.users → create profiles row
--   2. custom_access_token_hook() — inject user_role into JWT claims
-- ============================================================

-- ============================================================
-- 1. Auto-create profiles row on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role TEXT;
BEGIN
  -- Role can be passed as raw_user_meta_data.role at signup time.
  -- Allowed values: 'broker_pm', 'consumer'. Anything else → 'consumer'.
  _role := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''),
    'consumer'
  );
  IF _role NOT IN ('broker_pm', 'consumer') THEN
    _role := 'consumer';
  END IF;

  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    phone,
    onboarded_via
  ) VALUES (
    NEW.id,
    _role,
    TRIM(COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NULL
    )),
    TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', NULL)),
    CASE
      WHEN NEW.raw_user_meta_data->>'invite_token' IS NOT NULL THEN 'passport_invite'
      ELSE 'organic'
    END
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent — handles edge cases

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. Custom JWT claims hook — injects user_role into every token
-- ============================================================
-- Supabase Auth Hook: https://supabase.com/docs/guides/auth/auth-hooks
-- Hook type: custom_access_token_hook
-- Receives: {"user_id": "...", "claims": {...}}
-- Returns:  {"claims": {..., "user_role": "broker_pm"}}
--
-- The hook function MUST be in the public schema and MUST be
-- granted EXECUTE to the supabase_auth_admin role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims    JSONB;
  user_role TEXT;
BEGIN
  -- Extract existing claims
  claims := event->'claims';

  -- Look up role from profiles
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::UUID;

  -- Default to consumer if not found
  IF user_role IS NULL THEN
    user_role := 'consumer';
  END IF;

  -- Inject user_role into claims
  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));

  -- Return modified claims
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to Supabase Auth internals
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

-- Allow the hook function to read profiles
GRANT SELECT ON public.profiles TO supabase_auth_admin;


-- ============================================================
-- 3. RLS on profiles — authenticated users see their own row
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role (gateway) can read all profiles (needed for role checks)
DROP POLICY IF EXISTS "profiles_service_read_all" ON public.profiles;
CREATE POLICY "profiles_service_read_all" ON public.profiles
  FOR SELECT TO service_role
  USING (true);

SELECT 'Session 5 auth migration complete' AS status;
