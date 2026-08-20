-- ============================================================
-- HomeOps — Initial Schema Migration
-- Version: 1.0.0  Date: 2026-07-16
-- Correct table order: extensions → types → base tables →
--   dependent tables → junction tables → RLS → functions
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- SHARED TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PROFILES  (extends auth.users — no FK dependencies)
-- ============================================================
CREATE TABLE public.profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                    TEXT NOT NULL CHECK (role IN ('broker_pm', 'consumer')) DEFAULT 'consumer',
  full_name               TEXT,
  phone                   TEXT,
  brokerage_name          TEXT,
  license_number          TEXT,
  agent_photo_url         TEXT,
  subscription_status     TEXT CHECK (subscription_status IN ('active', 'trialing', 'canceled', 'none')) DEFAULT 'none',
  subscription_expires_at TIMESTAMPTZ,
  onboarded_via           TEXT CHECK (onboarded_via IN ('passport_invite', 'organic')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- CORPUS DOCUMENTS  (no FK to other app tables)
-- ============================================================
CREATE TABLE public.corpus_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make             TEXT NOT NULL,
  model_canonical  TEXT NOT NULL,
  model_variants   TEXT[],
  appliance_type   TEXT NOT NULL,
  doc_type         TEXT NOT NULL CHECK (doc_type IN ('service_manual', 'owner_manual', 'error_code_ref')),
  year_start       INTEGER,
  year_end         INTEGER,
  source_url       TEXT,
  source_slug      TEXT,
  license          TEXT NOT NULL,
  coverage_depth   TEXT NOT NULL CHECK (coverage_depth IN ('service_manual', 'owner_manual_only')),
  raw_file_path    TEXT,
  page_count       INTEGER,
  quality_score    INTEGER,
  ingestion_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX corpus_documents_make_type_idx      ON public.corpus_documents(make, appliance_type);
CREATE INDEX corpus_documents_model_canonical_idx ON public.corpus_documents(model_canonical);

-- ============================================================
-- MODEL REGISTRY  (FK to corpus_documents)
-- ============================================================
CREATE TABLE public.model_registry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number         TEXT NOT NULL,
  model_normalized     TEXT NOT NULL,
  make                 TEXT NOT NULL,
  brand                TEXT,
  appliance_type       TEXT,
  year_introduced      INTEGER,
  year_discontinued    INTEGER,
  corpus_document_id   UUID REFERENCES public.corpus_documents(id),
  cpsc_recall_ids      TEXT[],
  energystar_certified BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX model_registry_normalized_idx ON public.model_registry(model_normalized);
CREATE INDEX model_registry_make_type_idx         ON public.model_registry(make, appliance_type);
CREATE INDEX model_registry_model_trgm_idx        ON public.model_registry USING gin(model_normalized gin_trgm_ops);

-- ============================================================
-- CORPUS CHUNKS  (FK to corpus_documents)
-- ============================================================
CREATE TABLE public.corpus_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          UUID NOT NULL REFERENCES public.corpus_documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  content         TEXT NOT NULL,
  chunk_type      TEXT NOT NULL DEFAULT 'prose' CHECK (chunk_type IN ('prose', 'error_code', 'spec', 'parts')),
  section         TEXT,
  section_path    TEXT,
  page_ref        INTEGER,
  embedding       vector(1536),
  make            TEXT NOT NULL,
  model_canonical TEXT NOT NULL,
  appliance_type  TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX corpus_chunks_embedding_idx ON public.corpus_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX corpus_chunks_model_canonical_idx ON public.corpus_chunks(model_canonical);
CREATE INDEX corpus_chunks_appliance_type_idx  ON public.corpus_chunks(appliance_type);
CREATE INDEX corpus_chunks_doc_id_idx          ON public.corpus_chunks(doc_id);

-- ============================================================
-- PROPERTIES  (FK to profiles)
-- ============================================================
CREATE TABLE public.properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           CHAR(2) NOT NULL,
  zip             TEXT NOT NULL,
  country         CHAR(2) NOT NULL DEFAULT 'US',
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  google_place_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX properties_created_by_idx ON public.properties(created_by);

-- ============================================================
-- APPLIANCES  (FK to properties + corpus_documents)
-- ============================================================
CREATE TYPE public.registration_method AS ENUM ('ocr', 'manual', 'imported');

CREATE TABLE public.appliances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  appliance_type      TEXT NOT NULL CHECK (appliance_type IN (
                        'dishwasher','washer','dryer','refrigerator',
                        'oven_range','microwave','hvac','water_heater',
                        'garbage_disposal','other')),
  make                TEXT NOT NULL,
  model               TEXT NOT NULL,
  model_normalized    TEXT,
  serial              TEXT,
  estimated_year      INTEGER,
  corpus_document_id  UUID REFERENCES public.corpus_documents(id),
  registration_method public.registration_method NOT NULL DEFAULT 'manual',
  ocr_raw_text        TEXT,
  ocr_confidence      NUMERIC(4,3),
  photo_urls          TEXT[],
  recall_status       TEXT CHECK (recall_status IN ('none','active','resolved','unknown')) DEFAULT 'unknown',
  cpsc_recall_ids     TEXT[],
  recall_checked_at   TIMESTAMPTZ,
  warranty_expires_at DATE,
  warranty_doc_url    TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER appliances_updated_at
  BEFORE UPDATE ON public.appliances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX appliances_property_id_idx    ON public.appliances(property_id);
CREATE INDEX appliances_model_normalized_idx ON public.appliances(model_normalized);
CREATE INDEX appliances_model_trgm_idx     ON public.appliances USING gin(model_normalized gin_trgm_ops);

-- ============================================================
-- PASSPORTS  (FK to properties + profiles)
-- ============================================================
CREATE TYPE public.passport_status AS ENUM ('draft', 'sent', 'activated', 'expired');

CREATE TABLE public.passports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES public.properties(id),
  created_by          UUID NOT NULL REFERENCES public.profiles(id),
  status              public.passport_status NOT NULL DEFAULT 'draft',
  activated_at        TIMESTAMPTZ,
  brand_agent_name    TEXT,
  brand_brokerage     TEXT,
  brand_photo_url     TEXT,
  brand_contact_email TEXT,
  brand_contact_phone TEXT,
  appliance_count     INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER passports_updated_at
  BEFORE UPDATE ON public.passports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX passports_created_by_idx  ON public.passports(created_by);
CREATE INDEX passports_property_id_idx ON public.passports(property_id);

-- ============================================================
-- PASSPORT_APPLIANCES  junction (FK to passports + appliances)
-- ============================================================
CREATE TABLE public.passport_appliances (
  passport_id  UUID NOT NULL REFERENCES public.passports(id) ON DELETE CASCADE,
  appliance_id UUID NOT NULL REFERENCES public.appliances(id) ON DELETE CASCADE,
  PRIMARY KEY (passport_id, appliance_id)
);

-- ============================================================
-- PASSPORT_INVITES  (FK to passports + profiles)
-- ============================================================
CREATE TYPE public.invite_channel AS ENUM ('sms', 'email', 'qr_print');
CREATE TYPE public.invite_delivery_status AS ENUM ('pending', 'sent', 'failed', 'opened');

CREATE TABLE public.passport_invites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id      UUID NOT NULL REFERENCES public.passports(id) ON DELETE CASCADE,
  token            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  channel          public.invite_channel NOT NULL,
  recipient_phone  TEXT,
  recipient_email  TEXT,
  delivery_status  public.invite_delivery_status NOT NULL DEFAULT 'pending',
  twilio_message_sid TEXT,
  resend_message_id  TEXT,
  delivered_at     TIMESTAMPTZ,
  opened_at        TIMESTAMPTZ,
  claimed_by       UUID REFERENCES public.profiles(id),
  activated_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX passport_invites_token_idx      ON public.passport_invites(token);
CREATE INDEX passport_invites_passport_id_idx ON public.passport_invites(passport_id);
CREATE INDEX passport_invites_claimed_by_idx  ON public.passport_invites(claimed_by);

-- ============================================================
-- DIAGNOSTIC_SESSIONS  (FK to appliances + profiles)
-- ============================================================
CREATE TYPE public.diagnostic_input_type AS ENUM ('text', 'voice');
CREATE TYPE public.diagnostic_status     AS ENUM ('processing', 'complete', 'error', 'safety_stopped');

CREATE TABLE public.diagnostic_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appliance_id      UUID NOT NULL REFERENCES public.appliances(id),
  user_id           UUID NOT NULL REFERENCES public.profiles(id),
  input_type        public.diagnostic_input_type NOT NULL,
  user_input_text   TEXT,
  audio_duration_s  INTEGER,
  status            public.diagnostic_status NOT NULL DEFAULT 'processing',
  corpus_chunks_used UUID[],
  retrieval_score   NUMERIC(4,3),
  likely_issue      TEXT,
  confidence        NUMERIC(4,3) NOT NULL DEFAULT 0,
  safe_steps        JSONB,
  safety_flag       TEXT,
  stop_here         BOOLEAN NOT NULL DEFAULT FALSE,
  source_citations  JSONB,
  raw_llm_response  JSONB,
  outcome           TEXT CHECK (outcome IN ('resolved','called_pro','did_nothing','pending_followup')),
  outcome_recorded_at TIMESTAMPTZ,
  followup_sent_at  TIMESTAMPTZ,
  report_pdf_url    TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX diagnostic_sessions_appliance_id_idx ON public.diagnostic_sessions(appliance_id);
CREATE INDEX diagnostic_sessions_user_id_idx      ON public.diagnostic_sessions(user_id);
CREATE INDEX diagnostic_sessions_status_idx       ON public.diagnostic_sessions(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_read"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- PROPERTIES
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "properties_broker_read" ON public.properties FOR SELECT
  USING (auth.uid() = created_by);
CREATE POLICY "properties_consumer_read" ON public.properties FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.passport_invites pi
    JOIN public.passports p ON p.id = pi.passport_id
    WHERE p.property_id = public.properties.id
      AND pi.claimed_by = auth.uid()
      AND pi.activated_at IS NOT NULL
  ));
CREATE POLICY "properties_broker_insert" ON public.properties FOR INSERT
  WITH CHECK (auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'broker_pm'));
CREATE POLICY "properties_broker_update" ON public.properties FOR UPDATE
  USING (auth.uid() = created_by);

-- APPLIANCES
ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appliances_broker_read" ON public.appliances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.properties WHERE id = public.appliances.property_id AND created_by = auth.uid()
  ));
CREATE POLICY "appliances_consumer_read" ON public.appliances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.passport_appliances pa
    JOIN public.passport_invites pi ON pi.passport_id = pa.passport_id
    WHERE pa.appliance_id = public.appliances.id
      AND pi.claimed_by = auth.uid()
      AND pi.activated_at IS NOT NULL
  ));
CREATE POLICY "appliances_broker_insert" ON public.appliances FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.properties WHERE id = public.appliances.property_id AND created_by = auth.uid()
  ));
CREATE POLICY "appliances_broker_update" ON public.appliances FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.properties WHERE id = public.appliances.property_id AND created_by = auth.uid()
  ));

-- PASSPORTS
ALTER TABLE public.passports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passports_broker_read" ON public.passports FOR SELECT
  USING (auth.uid() = created_by);
CREATE POLICY "passports_consumer_read" ON public.passports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.passport_invites
    WHERE passport_id = public.passports.id
      AND claimed_by = auth.uid()
      AND activated_at IS NOT NULL
  ));
CREATE POLICY "passports_broker_insert" ON public.passports FOR INSERT
  WITH CHECK (auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'broker_pm'));
CREATE POLICY "passports_broker_update" ON public.passports FOR UPDATE
  USING (auth.uid() = created_by);

-- PASSPORT_INVITES
ALTER TABLE public.passport_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites_broker_read" ON public.passport_invites FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.passports WHERE id = public.passport_invites.passport_id AND created_by = auth.uid()
  ));
CREATE POLICY "invites_token_read" ON public.passport_invites FOR SELECT
  USING (TRUE);  -- token validation: gateway uses service role; anyone with token can read (token is secret)
CREATE POLICY "invites_consumer_update" ON public.passport_invites FOR UPDATE
  USING (token IS NOT NULL);  -- gateway uses service role for claim updates

-- DIAGNOSTIC_SESSIONS
ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_owner_read" ON public.diagnostic_sessions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "sessions_owner_insert" ON public.diagnostic_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_owner_update" ON public.diagnostic_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- CORPUS (read-only for authenticated users; writes via service role only)
ALTER TABLE public.corpus_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corpus_docs_authenticated_read" ON public.corpus_documents FOR SELECT
  TO authenticated USING (TRUE);

ALTER TABLE public.corpus_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corpus_chunks_authenticated_read" ON public.corpus_chunks FOR SELECT
  TO authenticated USING (TRUE);

ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_registry_authenticated_read" ON public.model_registry FOR SELECT
  TO authenticated USING (TRUE);

-- ============================================================
-- JWT HOOK  (custom claims — user_role injected into JWT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.homeops_jwt_hook(event JSONB)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  user_role TEXT;
  claims    JSONB;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role, 'consumer')));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

SELECT 'HomeOps schema v1.0 installed successfully.' AS status;
