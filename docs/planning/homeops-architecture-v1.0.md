# HomeOps — Architecture Document v1.0
**Version:** 1.0 — Green-field React Native / Expo  
**Date:** 2026-07-16  
**Architect:** Winston (BMAD)  
**Status:** Working Draft — Locked Decisions Incorporated  

> Dense, opinionated, buildable. Every technology choice is made. No "we could use X or Y." Solo founder + AI agents is the execution context — every decision favors minimum-surface-area infrastructure with zero ops where possible.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Model (Supabase / PostgreSQL DDL)](#2-data-model)
3. [API Surface — Fly.io Gateway](#3-api-surface)
4. [React Native / Expo Project Structure](#4-project-structure)
5. [AI / Diagnostic Engine Design](#5-diagnostic-engine)
6. [Auth & Multi-Tenancy](#6-auth--multi-tenancy)
7. [Vercel Web Layer (Next.js)](#7-vercel-web-layer)
8. [Infrastructure & Deployment](#8-infrastructure--deployment)
9. [Phase 0 Build Sequence](#9-phase-0-build-sequence)
10. [Open Architectural Questions](#10-open-architectural-questions)

---

## 1. System Overview

### 1.1 Component Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MOBILE APP (Expo)                                  │
│   com.homeops · iOS + Android · EAS Build                                  │
│                                                                             │
│   Broker flow: Walk-Through → OCR → Appliance Record → Passport → Invite   │
│   Consumer flow: QR/Link → Activate → Appliance List → Diagnostic Session  │
└──────────┬──────────────────────────────────────────┬───────────────────────┘
           │                                          │
           │ Auth + direct data reads                 │ All AI / diagnostic /
           │ (Supabase JS client)                     │ write ops + invite flow
           ▼                                          ▼
┌──────────────────────┐               ┌──────────────────────────────────────┐
│   SUPABASE           │               │   FLY.IO GATEWAY (Bun / Hono)        │
│                      │               │   api.homeops.app                    │
│   • PostgreSQL 15    │◄──────────────│                                      │
│   • Auth (JWT)       │               │   • OCR normalization (model lookup) │
│   • pgvector         │               │   • Passport creation + writes       │
│   • Storage (S3)     │               │   • Twilio SMS/Resend email          │
│   • RLS enforcement  │               │   • Whisper transcription bridge     │
│                      │               │   • Diagnostic engine (RAG + Claude) │
│   DB: us-east-1      │               │   • Timestamped fraud-resistant log  │
└──────────────────────┘               │   • Future: insurance API bridge     │
           ▲                           └──────────────────────────────────────┘
           │                                          ▲
           │ Direct Supabase reads                    │ Diagnostic API calls
           │ (supabase-js, SSR)                       │ (server-side only)
           ▼                                          │
┌─────────────────────────────────────────────────────┘
│   VERCEL (Next.js 14 App Router)                    
│   homeops.app                                        
│                                                     
│   /p/[token]         → Public passport view (SSG + ISR)
│   /dashboard         → Broker dashboard (SSR, auth required)
│   /activate/[token]  → Consumer activation landing page
│   /app/[...]         → Consumer appliance dashboard (SSR, auth required)
└─────────────────────────────────────────────────────

External services:
  • Anthropic Claude API  — diagnostic LLM (claude-3-5-haiku primary)
  • OpenAI Whisper API    — voice transcription (Phase 1)
  • Google Vision API     — model plate OCR
  • Twilio                — SMS invite delivery
  • Resend                — email invite delivery
  • CPSC API              — recall data (weekly poll)
  • EnergyStar CSV        — model registry bootstrap
```

### 1.2 Data Flow: Broker Walk-Through → Consumer Activation → Diagnostic

```
PHASE 0: SUPPLY CREATION
─────────────────────────
1. Broker opens HomeOps app (authenticated as broker_pm)
2. Taps "New Walk-Through" → enters property address (Google Places autocomplete)
   → creates `properties` record via Fly.io gateway
3. For each appliance:
   a. Camera mode opens (expo-camera)
   b. Photo → POST to Google Vision API (from Fly.io gateway — API key never on device)
   c. Vision API returns raw text → Fly.io normalizes against model_registry
   d. Returns: { make, model, appliance_type, estimated_age, recall_status }
   e. Broker confirms/corrects → Fly.io writes `appliances` record
4. Broker taps "Create Passport"
   → Fly.io creates `passports` record + all appliance FK links
5. Broker taps "Send Invite" (buyer phone/email)
   → Fly.io POST /passports/{id}/invite:
     - Generates UUID token → stores in `passport_invites`
     - Twilio sends SMS: "Your HomeOps appliance passport: homeops.app/activate?t={token}"
     - Resend sends email with same link + branded passport summary
     - QR code encoded from same URL → returned to broker for printing

PHASE 1: CONSUMER ACTIVATION
─────────────────────────────
6. Consumer taps SMS link or scans QR → browser opens homeops.app/activate?t={token}
7. Vercel page validates token (GET /api/v1/passports/{id}/activate on Fly.io)
   → Returns passport preview: property address + appliance list
8. Consumer taps "Activate" → prompted to install app (or web fallback)
9. App opens deep link → Supabase passwordless auth (OTP to consumer's email/phone)
10. On auth: Fly.io seeds consumer's appliance list (marks passport_invites.claimed_by)
    → `properties` record gains consumer as authorized viewer
    → consumer can now see all appliances in their passport

PHASE 1: DIAGNOSTIC SESSION
─────────────────────────────
11. Consumer selects appliance → taps "Diagnose"
12. Text path: consumer types symptoms → POST /api/v1/diagnostic/session
    Voice path (Phase 1): consumer records audio → POST /api/v1/diagnostic/voice
    → Fly.io forwards audio to Whisper API → returns transcript
    → transcript fed into POST /api/v1/diagnostic/session
13. Fly.io diagnostic engine:
    a. Embeds user query (text-embedding-3-small)
    b. pgvector similarity search on corpus_chunks filtered by model_number
    c. Top-5 chunks retrieved from Supabase
    d. Anthropic Claude call: system prompt + manual chunks + user query
    e. Response parsed to structured JSON
    f. Safety pre-filter runs BEFORE LLM and AFTER LLM output
    g. Result stored in `diagnostic_sessions`
14. GET /api/v1/diagnostic/session/{id} → client polls until status != 'processing'
15. App renders: diagnosis, confidence bar, safe_steps[], safety_flag if set
```

### 1.3 Separation of Concerns

| What | Where | Why |
|------|-------|-----|
| Auth token issuance | Supabase Auth | Managed auth, RLS integration |
| Direct data reads (appliance list, property info) | Mobile → Supabase directly | Low latency, no gateway overhead |
| All writes | Mobile → Fly.io gateway | Timestamp integrity, business logic, fraud mitigation |
| OCR model plate processing | Fly.io | API keys never on device; normalization logic |
| Diagnostic engine | Fly.io | LLM API keys, RAG logic, safety enforcement server-side |
| Invite generation + SMS/email | Fly.io | Twilio/Resend keys off-device; token generation |
| Passport public view | Vercel | SSG/ISR, CDN-delivered, SEO-friendly for sharing |
| Broker dashboard | Vercel | SSR with auth, direct Supabase reads |
| Consumer app dashboard | React Native (mobile) | Primary consumer surface |
| Corpus embeddings | Supabase pgvector | Co-located with app DB, zero additional ops |

---

## 2. Data Model

All migrations managed via Supabase CLI. Run `supabase db push` to apply. Schema lives in `supabase/migrations/`.

```sql
-- ============================================================
-- ENABLE EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- fuzzy model number matching

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
-- Supabase auth.users holds email, phone, created_at, etc.
-- This table holds HomeOps-specific profile data.

CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('broker_pm', 'consumer'))
                  DEFAULT 'consumer',
  full_name       TEXT,
  phone           TEXT,
  -- Broker/PM only fields
  brokerage_name  TEXT,
  license_number  TEXT,
  agent_photo_url TEXT,
  -- Subscription state (broker_pm only)
  subscription_status TEXT CHECK (subscription_status IN ('active', 'trialing', 'canceled', 'none'))
                       DEFAULT 'none',
  subscription_expires_at TIMESTAMPTZ,
  -- Consumer only
  onboarded_via   TEXT CHECK (onboarded_via IN ('passport_invite', 'organic', NULL)),
  -- Shared
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PROPERTIES
-- ============================================================
CREATE TABLE public.properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  -- Address (structured for search)
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           CHAR(2) NOT NULL,
  zip             TEXT NOT NULL,
  country         CHAR(2) NOT NULL DEFAULT 'US',
  -- Geocode (from Google Places — store for future use)
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  google_place_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Broker sees their properties; consumers see properties via passport
CREATE INDEX properties_created_by_idx ON public.properties(created_by);

-- ============================================================
-- APPLIANCES
-- ============================================================
CREATE TYPE registration_method AS ENUM ('ocr', 'manual', 'imported');

CREATE TABLE public.appliances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- Identity
  appliance_type      TEXT NOT NULL
                      CHECK (appliance_type IN (
                        'dishwasher', 'washer', 'dryer', 'refrigerator',
                        'oven_range', 'microwave', 'hvac', 'water_heater',
                        'garbage_disposal', 'other'
                      )),
  make                TEXT NOT NULL,
  model               TEXT NOT NULL,
  model_normalized    TEXT,                 -- set by gateway on write
  serial              TEXT,
  estimated_year      INTEGER,              -- manufacture year from serial decode or user input
  -- Corpus link
  corpus_document_id  UUID REFERENCES public.corpus_documents(id),
  -- Registration
  registration_method registration_method NOT NULL DEFAULT 'manual',
  ocr_raw_text        TEXT,                -- raw OCR output for audit
  ocr_confidence      NUMERIC(4,3),        -- 0.000 – 1.000
  -- Photos
  photo_urls          TEXT[],              -- Supabase Storage URLs
  -- Recall (refreshed weekly from CPSC)
  recall_status       TEXT CHECK (recall_status IN ('none', 'active', 'resolved', 'unknown'))
                      DEFAULT 'unknown',
  cpsc_recall_ids     TEXT[],
  recall_checked_at   TIMESTAMPTZ,
  -- Warranty
  warranty_expires_at DATE,
  warranty_doc_url    TEXT,
  -- Notes
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER appliances_updated_at
  BEFORE UPDATE ON public.appliances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX appliances_property_id_idx ON public.appliances(property_id);
CREATE INDEX appliances_model_normalized_idx ON public.appliances(model_normalized);
-- Trigram index for fuzzy model number search
CREATE INDEX appliances_model_trgm_idx ON public.appliances USING gin(model_normalized gin_trgm_ops);

-- ============================================================
-- PASSPORTS
-- ============================================================
CREATE TYPE passport_status AS ENUM ('draft', 'sent', 'activated', 'expired');

CREATE TABLE public.passports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES public.properties(id),
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  -- Status lifecycle: draft → sent → activated
  status          passport_status NOT NULL DEFAULT 'draft',
  activated_at    TIMESTAMPTZ,
  -- Branding (snapshot at creation — broker may change profile later)
  brand_agent_name    TEXT,
  brand_brokerage     TEXT,
  brand_photo_url     TEXT,
  brand_contact_email TEXT,
  brand_contact_phone TEXT,
  -- Metadata
  appliance_count INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER passports_updated_at
  BEFORE UPDATE ON public.passports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX passports_created_by_idx ON public.passports(created_by);
CREATE INDEX passports_property_id_idx ON public.passports(property_id);

-- Junction: which appliances are in this passport
CREATE TABLE public.passport_appliances (
  passport_id   UUID NOT NULL REFERENCES public.passports(id) ON DELETE CASCADE,
  appliance_id  UUID NOT NULL REFERENCES public.appliances(id) ON DELETE CASCADE,
  PRIMARY KEY (passport_id, appliance_id)
);

-- ============================================================
-- PASSPORT INVITES
-- ============================================================
CREATE TYPE invite_channel AS ENUM ('sms', 'email', 'qr_print');
CREATE TYPE invite_delivery_status AS ENUM ('pending', 'sent', 'failed', 'opened');

CREATE TABLE public.passport_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id     UUID NOT NULL REFERENCES public.passports(id) ON DELETE CASCADE,
  -- Token used in homeops.app/activate?t={token}
  token           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- Delivery
  channel         invite_channel NOT NULL,
  recipient_phone TEXT,
  recipient_email TEXT,
  delivery_status invite_delivery_status NOT NULL DEFAULT 'pending',
  twilio_message_sid TEXT,    -- for SMS delivery tracking
  resend_message_id  TEXT,    -- for email delivery tracking
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  -- Activation
  claimed_by      UUID REFERENCES public.profiles(id),
  activated_at    TIMESTAMPTZ,
  -- Expiry: 90 days from send
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX passport_invites_token_idx ON public.passport_invites(token);
CREATE INDEX passport_invites_passport_id_idx ON public.passport_invites(passport_id);
CREATE INDEX passport_invites_claimed_by_idx ON public.passport_invites(claimed_by);

-- ============================================================
-- DIAGNOSTIC SESSIONS
-- ============================================================
CREATE TYPE diagnostic_input_type AS ENUM ('text', 'voice');
CREATE TYPE diagnostic_status AS ENUM ('processing', 'complete', 'error', 'safety_stopped');
CREATE TYPE diagnostic_outcome AS ENUM ('resolved', 'called_pro', 'did_nothing', 'pending_followup', NULL);

CREATE TABLE public.diagnostic_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appliance_id      UUID NOT NULL REFERENCES public.appliances(id),
  user_id           UUID NOT NULL REFERENCES public.profiles(id),
  -- Input
  input_type        diagnostic_input_type NOT NULL,
  user_input_text   TEXT,                  -- typed text or whisper transcript
  audio_duration_s  INTEGER,               -- voice input duration (audio not stored)
  -- Processing
  status            diagnostic_status NOT NULL DEFAULT 'processing',
  -- RAG context (stored for quality review + Trust Constitution audit)
  corpus_chunks_used UUID[],               -- chunk IDs retrieved
  retrieval_score   NUMERIC(4,3),          -- top-1 cosine similarity score
  -- LLM Output (structured JSON from Claude)
  likely_issue      TEXT,
  confidence        NUMERIC(4,3) NOT NULL DEFAULT 0,  -- 0.000 – 1.000
  safe_steps        JSONB,                 -- [{step: string, caution: string|null}]
  safety_flag       TEXT,                  -- null or human-readable danger description
  stop_here         BOOLEAN NOT NULL DEFAULT FALSE,
  source_citations  JSONB,                 -- [{manual: string, section: string, page: int}]
  raw_llm_response  JSONB,                 -- full response for audit
  -- Outcome tracking (Trust Constitution Rule 8)
  outcome           TEXT CHECK (outcome IN ('resolved', 'called_pro', 'did_nothing', 'pending_followup')),
  outcome_recorded_at TIMESTAMPTZ,
  followup_sent_at  TIMESTAMPTZ,           -- 7-day follow-up prompt timestamp
  -- Report export
  report_pdf_url    TEXT,
  -- Timestamps
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX diagnostic_sessions_appliance_id_idx ON public.diagnostic_sessions(appliance_id);
CREATE INDEX diagnostic_sessions_user_id_idx ON public.diagnostic_sessions(user_id);
CREATE INDEX diagnostic_sessions_status_idx ON public.diagnostic_sessions(status);

-- ============================================================
-- CORPUS DOCUMENTS
-- ============================================================
CREATE TABLE public.corpus_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make             TEXT NOT NULL,
  model_canonical  TEXT NOT NULL,
  model_variants   TEXT[],               -- all model numbers this doc covers
  appliance_type   TEXT NOT NULL,
  doc_type         TEXT NOT NULL         -- service_manual | owner_manual | error_code_ref
                   CHECK (doc_type IN ('service_manual', 'owner_manual', 'error_code_ref')),
  year_start       INTEGER,
  year_end         INTEGER,
  source_url       TEXT,
  source_slug      TEXT,                 -- whirlpool_portal | manualslib | ifixit | etc.
  license          TEXT NOT NULL,        -- copyright_fair_use | cc_by_nc_sa | cc_by | public_domain
  coverage_depth   TEXT NOT NULL         -- service_manual | owner_manual_only
                   CHECK (coverage_depth IN ('service_manual', 'owner_manual_only')),
  raw_file_path    TEXT,                 -- Supabase Storage path
  page_count       INTEGER,
  quality_score    INTEGER,              -- 0-100 from pipeline/quality.py
  ingestion_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX corpus_documents_make_type_idx ON public.corpus_documents(make, appliance_type);
CREATE INDEX corpus_documents_model_canonical_idx ON public.corpus_documents(model_canonical);

-- ============================================================
-- CORPUS CHUNKS (RAG)
-- ============================================================
CREATE TABLE public.corpus_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID NOT NULL REFERENCES public.corpus_documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  chunk_type    TEXT NOT NULL DEFAULT 'prose'
                CHECK (chunk_type IN ('prose', 'error_code', 'spec', 'parts')),
  section       TEXT,
  section_path  TEXT,
  page_ref      INTEGER,
  -- Vector embedding (text-embedding-3-small = 1536 dims)
  embedding     vector(1536),
  -- Metadata for filtering (duplicated from doc for query efficiency)
  make          TEXT NOT NULL,
  model_canonical TEXT NOT NULL,
  appliance_type  TEXT NOT NULL,
  -- Chunk metadata
  metadata      JSONB,                   -- full chunk metadata blob
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index — cosine similarity (best for normalized text embeddings)
CREATE INDEX corpus_chunks_embedding_idx
  ON public.corpus_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Filter indexes for pre-filtering before vector search
CREATE INDEX corpus_chunks_model_canonical_idx ON public.corpus_chunks(model_canonical);
CREATE INDEX corpus_chunks_appliance_type_idx ON public.corpus_chunks(appliance_type);
CREATE INDEX corpus_chunks_doc_id_idx ON public.corpus_chunks(doc_id);

-- ============================================================
-- MODEL REGISTRY (passport seeding — no full manual needed)
-- ============================================================
CREATE TABLE public.model_registry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number        TEXT NOT NULL,
  model_normalized    TEXT NOT NULL,
  make                TEXT NOT NULL,
  brand               TEXT,               -- e.g., KitchenAid (brand) vs. Whirlpool (make)
  appliance_type      TEXT,
  year_introduced     INTEGER,
  year_discontinued   INTEGER,
  corpus_document_id  UUID REFERENCES public.corpus_documents(id),
  cpsc_recall_ids     TEXT[],
  energystar_certified BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX model_registry_normalized_idx ON public.model_registry(model_normalized);
CREATE INDEX model_registry_make_type_idx ON public.model_registry(make, appliance_type);
CREATE INDEX model_registry_model_trgm_idx ON public.model_registry USING gin(model_normalized gin_trgm_ops);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- profiles_insert is handled by Supabase Auth hook (trigger creates profile on signup)


-- PROPERTIES
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Broker/PM: read own properties
CREATE POLICY "properties_broker_read" ON public.properties
  FOR SELECT USING (
    auth.uid() = created_by
  );

-- Consumer: read properties linked to their activated passports
CREATE POLICY "properties_consumer_read" ON public.properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.passport_invites pi
      JOIN public.passports p ON p.id = pi.passport_id
      WHERE p.property_id = public.properties.id
        AND pi.claimed_by = auth.uid()
        AND pi.activated_at IS NOT NULL
    )
  );

-- Only broker_pm can create properties (gateway enforces role check before DB write)
CREATE POLICY "properties_broker_insert" ON public.properties
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'broker_pm'
    )
  );

CREATE POLICY "properties_broker_update" ON public.properties
  FOR UPDATE USING (auth.uid() = created_by);


-- APPLIANCES
ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;

-- Broker: read appliances on their properties
CREATE POLICY "appliances_broker_read" ON public.appliances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = public.appliances.property_id
        AND created_by = auth.uid()
    )
  );

-- Consumer: read appliances in their activated passport
CREATE POLICY "appliances_consumer_read" ON public.appliances
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.passport_appliances pa
      JOIN public.passport_invites pi ON pi.passport_id = pa.passport_id
      WHERE pa.appliance_id = public.appliances.id
        AND pi.claimed_by = auth.uid()
        AND pi.activated_at IS NOT NULL
    )
  );

CREATE POLICY "appliances_broker_insert" ON public.appliances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = public.appliances.property_id
        AND created_by = auth.uid()
    )
  );

CREATE POLICY "appliances_broker_update" ON public.appliances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = public.appliances.property_id
        AND created_by = auth.uid()
    )
  );


-- PASSPORTS
ALTER TABLE public.passports ENABLE ROW LEVEL SECURITY;

-- Broker: read own passports
CREATE POLICY "passports_broker_read" ON public.passports
  FOR SELECT USING (auth.uid() = created_by);

-- Consumer: read passports they've activated (limited — Trust Constitution Rule 11)
-- Consumers see the passport ONLY to know which property/appliances are theirs.
-- They cannot see broker's other passports.
CREATE POLICY "passports_consumer_read" ON public.passports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.passport_invites
      WHERE passport_id = public.passports.id
        AND claimed_by = auth.uid()
        AND activated_at IS NOT NULL
    )
  );

CREATE POLICY "passports_broker_insert" ON public.passports
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'broker_pm'
    )
  );

CREATE POLICY "passports_broker_update" ON public.passports
  FOR UPDATE USING (auth.uid() = created_by);


-- PASSPORT INVITES
ALTER TABLE public.passport_invites ENABLE ROW LEVEL SECURITY;

-- Broker: read invites for their passports
CREATE POLICY "passport_invites_broker_read" ON public.passport_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.passports
      WHERE id = public.passport_invites.passport_id
        AND created_by = auth.uid()
    )
  );

-- Consumer: read their own invite (after activation)
CREATE POLICY "passport_invites_consumer_read" ON public.passport_invites
  FOR SELECT USING (claimed_by = auth.uid());

-- Invite token lookup (unauthenticated — for activation flow)
-- Gateway validates token via service_role key; mobile client uses gateway, not direct DB.


-- DIAGNOSTIC SESSIONS
ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;

-- Consumer: read/write own diagnostic sessions only
CREATE POLICY "diagnostic_sessions_user_read" ON public.diagnostic_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "diagnostic_sessions_user_insert" ON public.diagnostic_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "diagnostic_sessions_user_update" ON public.diagnostic_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Broker: ZERO access to diagnostic sessions (Trust Constitution Rule 11, 12)
-- No policy exists for broker access — RLS blocks it by default.


-- CORPUS (read-only from application — writes only via service_role in pipeline)
ALTER TABLE public.corpus_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corpus_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;

-- Corpus is readable by any authenticated user (needed for RAG retrieval)
CREATE POLICY "corpus_documents_authenticated_read" ON public.corpus_documents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "corpus_chunks_authenticated_read" ON public.corpus_chunks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "model_registry_authenticated_read" ON public.model_registry
  FOR SELECT USING (auth.role() = 'authenticated');
```

---

## 3. API Surface

**Base URL:** `https://api.homeops.app`  
**Auth:** All endpoints require `Authorization: Bearer {supabase_jwt}` except `/activate`.  
**Runtime:** Bun + Hono on Fly.io. *Rationale: Bun cold starts in <50ms (critical for mobile UX), Hono is TypeScript-native with zero-overhead routing.*

### Why Fly.io (not direct Supabase or Vercel)?

| Concern | Explanation |
|---------|-------------|
| API key security | Anthropic, OpenAI, Twilio, Google Vision keys never touch the client |
| Timestamp integrity | Diagnostic sessions timestamped at gateway — not client — for fraud mitigation and future insurance API use |
| Business logic enforcement | Safety stops enforced in server code; client cannot bypass |
| Long-running ops | Whisper transcription + Claude calls can take 5–15s — Fly.io machines hold open connections; Vercel serverless 25s timeout is marginal |
| Future: insurance bridge | Enterprise insurance APIs require a stable, audited server endpoint, not serverless |

---

### Phase 0 Endpoints

---

#### `POST /api/v1/walk-through/scan`

**Auth:** Required. Role must be `broker_pm`.  
**Why Fly.io:** Google Vision API key never exposed to client; normalization logic runs server-side.

**Request:**
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQ...",
  "property_id": "uuid"
}
```

**Response 200:**
```json
{
  "scan_id": "uuid",
  "ocr_raw_text": "WDT780SAEM1 DISHWASHER SER: F01234567",
  "normalized": {
    "make": "Whirlpool",
    "brand": "Whirlpool",
    "model": "WDT780SAEM",
    "model_normalized": "WDT780SAEM",
    "appliance_type": "dishwasher",
    "estimated_year": 2020,
    "year_range": "2018–2022",
    "corpus_document_id": "uuid-or-null",
    "recall_status": "none",
    "cpsc_recall_ids": [],
    "confidence": 0.94
  },
  "match_method": "exact"  // "exact" | "fuzzy" | "family" | "none"
}
```

**Response 200 (no match):**
```json
{
  "scan_id": "uuid",
  "ocr_raw_text": "ZPQ-7731B SOME BRAND",
  "normalized": null,
  "match_method": "none",
  "fallback_prompt": "Model not found in corpus. Please enter make, model, and appliance type manually."
}
```

**Internal flow:**  
1. Forward image to Google Vision API  
2. Extract model number from raw text (regex pipeline + claude-3-haiku fallback for ambiguous plates)  
3. Normalize model number  
4. Lookup `model_registry` — exact → fuzzy (pg_trgm) → family prefix  
5. Return structured result

---

#### `POST /api/v1/passports`

**Auth:** Required. Role must be `broker_pm`.  
**Why Fly.io:** Transactional write across `passports`, `passport_appliances`; branding snapshot logic.

**Request:**
```json
{
  "property_id": "uuid",
  "appliance_ids": ["uuid1", "uuid2", "uuid3"],
  "branding": {
    "agent_name": "Sarah Chen",
    "brokerage": "RE/MAX Classic",
    "photo_url": "https://...",
    "contact_email": "sarah@remax.com",
    "contact_phone": "+15594445555"
  }
}
```

**Response 201:**
```json
{
  "passport_id": "uuid",
  "status": "draft",
  "appliance_count": 3,
  "public_url": "https://homeops.app/p/uuid",
  "created_at": "2026-07-16T14:00:00Z"
}
```

---

#### `POST /api/v1/passports/{id}/invite`

**Auth:** Required. Role must be `broker_pm` and must own the passport.  
**Why Fly.io:** Twilio/Resend API keys server-side; QR generation; token creation.

**Request:**
```json
{
  "channel": "sms",  // "sms" | "email" | "both"
  "recipient_phone": "+15594445555",
  "recipient_email": "buyer@email.com"
}
```

**Response 200:**
```json
{
  "invite_id": "uuid",
  "token": "uuid",
  "activation_url": "https://homeops.app/activate?t={token}",
  "qr_code_url": "https://api.homeops.app/qr/{token}.png",
  "sms_status": "sent",
  "email_status": "sent",
  "expires_at": "2026-10-14T14:00:00Z"
}
```

**Internal flow:**  
1. Generate UUID token, write `passport_invites` row  
2. Encode activation URL as QR PNG (using `qrcode` npm package) → return URL  
3. Twilio REST API: send SMS with activation URL  
4. Resend API: send branded HTML email with passport summary + QR code image  
5. Update `passports.status` = 'sent'

---

#### `GET /api/v1/passports/{id}/activate?t={token}`

**Auth:** None required (consumer may not have account yet).  
**Why Fly.io:** Token validation; consumer account seeding logic; server-side timestamps.

**Query params:** `t` = invite token UUID

**Response 200 (valid token, not yet claimed):**
```json
{
  "passport_id": "uuid",
  "status": "valid",
  "property": {
    "address_line1": "123 Main St",
    "city": "Lexington",
    "state": "KY",
    "zip": "40502"
  },
  "appliances": [
    {
      "id": "uuid",
      "appliance_type": "dishwasher",
      "make": "Whirlpool",
      "model": "WDT780SAEM",
      "estimated_year": 2020,
      "photo_url": "https://...",
      "recall_status": "none"
    }
  ],
  "branding": {
    "agent_name": "Sarah Chen",
    "brokerage": "RE/MAX Classic",
    "photo_url": "https://..."
  },
  "expires_at": "2026-10-14T14:00:00Z"
}
```

**Response 410 (expired or already claimed):**
```json
{
  "error": "invite_expired",
  "message": "This invite link has expired or has already been used."
}
```

**After consumer authenticates** (Supabase OTP flow on client), client calls:

#### `POST /api/v1/passports/{id}/claim`

**Auth:** Required (newly created consumer account).

**Request:**
```json
{ "token": "uuid" }
```

**Response 200:**
```json
{
  "claimed": true,
  "appliances_seeded": 3,
  "property_id": "uuid"
}
```

**Internal flow:**  
1. Validate token, confirm `claimed_by IS NULL`, confirm `expires_at > NOW()`  
2. Write `passport_invites.claimed_by` = consumer's auth.uid()  
3. Write `passport_invites.activated_at` = NOW()  
4. Update `passports.status` = 'activated', `passports.activated_at` = NOW()  
5. Consumer's RLS policy now resolves — they can read appliances via the invite  
6. Ensure consumer profile exists (upsert with role='consumer', onboarded_via='passport_invite')

---

#### `POST /api/v1/diagnostic/session`

**Auth:** Required. User must have access to the appliance (RLS-verified by gateway via service_role lookup).  
**Why Fly.io:** Anthropic API key; RAG retrieval; safety enforcement; server-side timestamps for fraud/audit.

**Request:**
```json
{
  "appliance_id": "uuid",
  "input_type": "text",
  "input_text": "My dishwasher is making a grinding noise during the wash cycle and water isn't draining fully"
}
```

**Response 202 (async — LLM call in progress):**
```json
{
  "session_id": "uuid",
  "status": "processing",
  "poll_url": "/api/v1/diagnostic/session/uuid",
  "estimated_seconds": 5
}
```

**Internal flow (async, on Fly.io worker):**
1. Validate appliance ownership  
2. Fetch appliance: `{make, model_normalized, appliance_type, corpus_document_id}`  
3. Safety pre-filter (rule-based, runs BEFORE LLM — see §5.4)  
4. If pre-filter triggers safety stop: write session with status='safety_stopped', stop_here=true, safety_flag set  
5. Embed user query: `openai.embeddings.create({input: text, model: 'text-embedding-3-small'})`  
6. pgvector retrieval: top-5 chunks filtered by `model_canonical` (or `appliance_type` if no model match)  
7. Construct Claude prompt (see §5.3)  
8. Anthropic API call: `claude-3-5-haiku-20241022`, structured JSON output  
9. Parse + validate response JSON  
10. Post-filter safety check on LLM output  
11. Write complete `diagnostic_sessions` row  
12. Update session status → 'complete' or 'safety_stopped'

---

#### `GET /api/v1/diagnostic/session/{id}`

**Auth:** Required. User must own the session.

**Response 200 (complete):**
```json
{
  "session_id": "uuid",
  "status": "complete",
  "appliance": {
    "id": "uuid",
    "make": "Whirlpool",
    "model": "WDT780SAEM",
    "appliance_type": "dishwasher"
  },
  "diagnosis": {
    "likely_issue": "Worn wash arm bearing or debris in chopper blade assembly causing grinding; partial drain blockage in sump area",
    "confidence": 0.82,
    "safe_steps": [
      {
        "step": "Cancel the cycle and power off the dishwasher at the breaker.",
        "caution": null
      },
      {
        "step": "Remove the lower spray arm (turn counterclockwise). Check for broken glass, seeds, or debris in the chopper assembly below.",
        "caution": "Wear rubber gloves — broken glass is common in this location."
      },
      {
        "step": "Check and clean the drain filter in the sump. Twist counterclockwise to remove.",
        "caution": null
      },
      {
        "step": "Run a short cycle to verify. If grinding continues, the chopper blade assembly likely needs replacement (part # W10872845).",
        "caution": null
      }
    ],
    "safety_flag": null,
    "stop_here": false,
    "source_citations": [
      {
        "manual": "Whirlpool WDT780SAEM Service Manual",
        "section": "Section 5 — Drain and Wash System",
        "page": 34
      }
    ]
  },
  "input_type": "text",
  "started_at": "2026-07-16T14:05:00Z",
  "completed_at": "2026-07-16T14:05:06Z"
}
```

**Response 200 (safety stopped):**
```json
{
  "session_id": "uuid",
  "status": "safety_stopped",
  "diagnosis": {
    "likely_issue": null,
    "confidence": 0,
    "safe_steps": [],
    "safety_flag": "Gas odor detected. This requires immediate professional response — do not proceed with any DIY steps.",
    "stop_here": true,
    "emergency_guidance": "Leave the home immediately. Do not use electrical switches. Call your gas utility emergency line or 911."
  }
}
```

**Response 200 (still processing):**
```json
{
  "session_id": "uuid",
  "status": "processing"
}
```

---

### Phase 1 Endpoints

---

#### `POST /api/v1/diagnostic/voice`

**Auth:** Required.  
**Why Fly.io:** OpenAI API key; audio blobs not stored per Trust Constitution Rule 13.

**Request:** `multipart/form-data`
- `audio`: audio file (webm/opus or m4a, max 25MB, per Whisper limits)
- `appliance_id`: UUID
- `duration_seconds`: integer

**Response 200:**
```json
{
  "transcript": "The dishwasher is making a grinding noise when it runs and the water isn't draining all the way",
  "confidence": 0.97,
  "duration_seconds": 8,
  "session_id": "uuid",
  "status": "processing",
  "poll_url": "/api/v1/diagnostic/session/uuid"
}
```

**Internal flow:**  
1. Receive audio blob in memory (never write to disk)  
2. POST to OpenAI Whisper API: `openai.audio.transcriptions.create({file: audioBlob, model: 'whisper-1'})`  
3. Audio blob discarded immediately after API call (Trust Constitution Rule 13)  
4. Transcript fed into diagnostic session pipeline (same as text path)  
5. Return transcript + session_id for polling

---

#### `GET /api/v1/appliances/{id}/recall`

**Auth:** Required.  
**Why Fly.io:** CPSC API call with server-side caching; updates `appliances.recall_status`.

**Response 200:**
```json
{
  "appliance_id": "uuid",
  "model": "WDT780SAEM",
  "recall_status": "none",
  "recalls": [],
  "checked_at": "2026-07-16T14:00:00Z"
}
```

**Response 200 (active recall):**
```json
{
  "appliance_id": "uuid",
  "model": "LRE3061ST",
  "recall_status": "active",
  "recalls": [
    {
      "cpsc_recall_id": "22-123",
      "title": "LG Electronics Recalls Electric Ranges",
      "date": "2022-03-01",
      "hazard": "Fire hazard",
      "remedy": "Stop using the product and contact LG for a free repair",
      "cpsc_url": "https://www.cpsc.gov/Recalls/2022/22-123"
    }
  ],
  "checked_at": "2026-07-16T14:00:00Z"
}
```

---

## 4. Project Structure

### 4.1 Monorepo Decision: **Single repo, Turborepo monorepo.**

**Rationale:** Shared TypeScript types between mobile and web eliminate an entire class of API contract bugs. Shared Supabase client config, shared validation schemas, shared API client — all zero-cost with a monorepo. Turborepo (not Nx) because it's lower-config, works natively with pnpm workspaces, and has first-class Vercel integration. The added complexity is justified; the alternative (two repos) creates coordination friction that kills a solo founder.

```
homeops-app/                          # bdatkinson/homeops-app (private)
├── apps/
│   ├── mobile/                       # Expo managed app (com.homeops)
│   └── web/                          # Next.js 14 App Router (homeops.app)
├── packages/
│   ├── shared/                       # Types, API client, schemas
│   ├── ui/                           # (Phase 1+) Shared design tokens if needed
│   └── supabase/                     # Supabase client + generated types
├── services/
│   └── gateway/                      # Fly.io Bun/Hono API gateway
├── supabase/
│   ├── migrations/                   # SQL migration files
│   ├── seed.sql                      # Dev seed data
│   └── config.toml                   # Supabase CLI config
├── .github/
│   └── workflows/
│       ├── mobile-eas.yml            # EAS Build on main push
│       ├── web-deploy.yml            # Vercel deploy
│       └── gateway-deploy.yml        # Fly.io deploy
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                      # Root workspace
└── .env.example
```

### 4.2 Navigation: **Expo Router**

**Rationale:** Expo Router is file-based routing — identical mental model to Next.js App Router, which powers the web layer. Deep link handling is automatic (no manual linking configuration). Universal links (iOS) and App Links (Android) resolve without custom native setup. For a solo founder maintaining both mobile and web, the consistent routing model across both surfaces reduces cognitive overhead significantly. React Navigation requires manual setup for every deep link; Expo Router handles it by convention.

### 4.3 `/apps/mobile` — Expo App Structure

```
apps/mobile/
├── app/                              # Expo Router — file-based routes
│   ├── _layout.tsx                   # Root layout (auth provider, navigation theme)
│   ├── index.tsx                     # Splash / role dispatch
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx               # Email + password (broker) or OTP (consumer)
│   │   └── sign-up.tsx               # Broker registration
│   ├── (broker)/
│   │   ├── _layout.tsx               # Broker tab navigator
│   │   ├── dashboard.tsx             # Passport list
│   │   ├── walk-through/
│   │   │   ├── index.tsx             # Start walk-through, enter address
│   │   │   ├── scan.tsx              # Camera + OCR scan screen
│   │   │   ├── confirm/[scanId].tsx  # Confirm/edit scanned appliance
│   │   │   └── review.tsx            # Review all appliances → create passport
│   │   ├── passport/
│   │   │   ├── [id].tsx             # Passport detail — appliances, invite status
│   │   │   └── invite/[id].tsx      # Send invite screen
│   │   └── settings.tsx
│   ├── (consumer)/
│   │   ├── _layout.tsx               # Consumer tab navigator
│   │   ├── home.tsx                  # Appliance list
│   │   ├── appliance/
│   │   │   ├── [id].tsx             # Appliance detail — history, recall status
│   │   │   └── diagnose/[id].tsx    # Diagnostic session screen
│   │   ├── session/
│   │   │   └── [id].tsx             # Diagnostic result screen
│   │   └── settings.tsx
│   └── activate.tsx                  # Deep link handler: homeops://activate?t={token}
├── components/
│   ├── camera/
│   │   ├── ModelPlateScan.tsx        # Walk-through camera component
│   │   └── ScanOverlay.tsx           # Viewfinder UI
│   ├── diagnostic/
│   │   ├── DiagnosticInput.tsx       # Text/voice input switcher
│   │   ├── VoiceRecorder.tsx         # expo-av recording UI
│   │   ├── ConfidenceBar.tsx         # Confidence percentage display
│   │   ├── SafeStepsList.tsx         # Ordered safe steps
│   │   └── SafetyStopCard.tsx        # Red emergency stop display
│   ├── passport/
│   │   ├── PassportCard.tsx          # Passport summary in dashboard
│   │   ├── ApplianceCard.tsx         # Appliance row in walk-through
│   │   └── InviteStatusBadge.tsx
│   ├── appliance/
│   │   ├── ApplianceIcon.tsx         # Type-based SVG icons
│   │   └── RecallBadge.tsx
│   └── ui/                           # Atoms: Button, Input, Card, Sheet, etc.
├── hooks/
│   ├── useAuth.ts                    # Supabase auth state
│   ├── useDiagnosticSession.ts       # Poll session until complete
│   ├── usePassports.ts               # SWR/React Query for broker passports
│   ├── useAppliances.ts              # Consumer appliance list
│   └── useCamera.ts                  # expo-camera + expo-image-picker
├── services/
│   ├── gateway.ts                    # Typed Fly.io gateway client (from @homeops/shared)
│   ├── supabase.ts                   # Supabase client instance
│   ├── storage.ts                    # Supabase Storage uploads (appliance photos)
│   └── notifications.ts             # Expo Push Notifications registration
├── constants/
│   ├── theme.ts                      # Colors, typography, spacing
│   └── config.ts                     # ENV vars (via expo-constants)
├── app.json                          # Expo config
├── eas.json                          # EAS Build profiles
├── tsconfig.json
└── package.json
```

### 4.4 `/apps/web` — Next.js App Structure

```
apps/web/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Marketing homepage (Phase 1+)
│   ├── p/[token]/                    # Public passport view (shareable)
│   │   └── page.tsx                  # SSG + ISR (revalidate: 3600)
│   ├── activate/
│   │   └── page.tsx                  # Consumer activation landing (client component)
│   ├── dashboard/
│   │   ├── layout.tsx                # Auth guard
│   │   ├── page.tsx                  # Broker dashboard — passport list
│   │   ├── passport/[id]/
│   │   │   └── page.tsx             # Passport detail + invite management
│   │   └── settings/
│   │       └── page.tsx
│   ├── app/                          # Consumer web app (secondary to mobile)
│   │   ├── layout.tsx               # Auth guard (consumer only)
│   │   ├── page.tsx                 # Consumer appliance list
│   │   └── appliance/[id]/
│   │       └── page.tsx
│   └── api/
│       └── qr/[token]/              # QR code image generation endpoint
│           └── route.ts
├── components/
│   ├── PassportPublicView.tsx        # Public passport card (used in /p/[token])
│   ├── QRCode.tsx                   # QR code display
│   ├── BrokerDashboard.tsx
│   └── ui/                          # Web-specific UI components
├── lib/
│   ├── supabase-server.ts           # Supabase server client (SSR)
│   ├── supabase-browser.ts          # Supabase browser client
│   └── gateway.ts                   # Fly.io gateway client (server-side calls)
├── middleware.ts                     # Auth middleware (Supabase session refresh)
├── next.config.ts
├── tsconfig.json
└── package.json
```

### 4.5 `/packages/shared` — Shared TypeScript Types

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── appliance.ts              # Appliance, ApplianceType, RegistrationMethod
│   │   ├── passport.ts              # Passport, PassportInvite, PassportStatus
│   │   ├── diagnostic.ts            # DiagnosticSession, DiagnosticResult, SafeStep
│   │   └── api.ts                   # Request/response shapes for all gateway endpoints
│   ├── schemas/
│   │   ├── diagnostic.ts            # Zod schemas for LLM output validation
│   │   └── passport.ts             # Zod schemas for passport creation
│   ├── client/
│   │   └── gateway.ts              # Typed fetch client for Fly.io gateway
│   └── constants/
│       ├── applianceTypes.ts        # Canonical appliance type list
│       └── safetyKeywords.ts        # Pre-filter keyword list (shared client+server)
├── package.json
└── tsconfig.json
```

### 4.6 `/services/gateway` — Fly.io API Gateway

```
services/gateway/
├── src/
│   ├── index.ts                     # Bun entry point, Hono app
│   ├── middleware/
│   │   ├── auth.ts                  # JWT validation (Supabase public key)
│   │   ├── roleGuard.ts             # broker_pm role enforcement
│   │   └── logger.ts                # Structured JSON logging (Fly.io log drain)
│   ├── routes/
│   │   ├── walkthrough.ts           # /api/v1/walk-through/scan
│   │   ├── passports.ts             # /api/v1/passports CRUD
│   │   ├── invites.ts               # /api/v1/passports/{id}/invite + claim
│   │   └── diagnostic.ts            # /api/v1/diagnostic/*
│   ├── services/
│   │   ├── ocr.ts                   # Google Vision API client
│   │   ├── modelLookup.ts           # model_registry query + normalization
│   │   ├── rag.ts                   # pgvector retrieval
│   │   ├── claude.ts                # Anthropic API client + prompt builder
│   │   ├── whisper.ts               # OpenAI Whisper client
│   │   ├── twilio.ts                # SMS delivery
│   │   ├── resend.ts                # Email delivery
│   │   └── cpsc.ts                  # CPSC recall API client
│   ├── safety/
│   │   ├── preFilter.ts             # Rule-based safety pre-filter
│   │   └── postFilter.ts            # LLM output safety validation
│   └── db/
│       └── supabase.ts              # Supabase service_role client
├── fly.toml
├── Dockerfile
├── tsconfig.json
└── package.json
```

### 4.7 Key Config Files

**`pnpm-workspace.yaml`**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

**`turbo.json`**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

**`apps/mobile/app.json` (key fields)**
```json
{
  "expo": {
    "name": "HomeOps",
    "slug": "homeops",
    "scheme": "homeops",
    "bundleIdentifier": "com.homeops",
    "android": { "package": "com.homeops" },
    "plugins": [
      "expo-router",
      "expo-camera",
      ["expo-av", { "microphonePermission": "HomeOps uses your microphone to record appliance symptoms for diagnosis." }],
      "expo-notifications"
    ],
    "extra": {
      "eas": { "projectId": "..." }
    }
  }
}
```

---

## 5. Diagnostic Engine

### 5.1 Voice Input Path (Phase 1)

```
1. User taps microphone button in DiagnosticInput.tsx
2. expo-av: Audio.startRecordingAsync({ ...recordingOptions })
   → format: m4a (iOS) / webm (Android)
   → bitrate: 128kbps (Whisper quality threshold)
3. User taps stop → Audio.stopRecordingAsync()
4. Read audio file: expo-file-system readAsStringAsync() → base64
5. POST /api/v1/diagnostic/voice (multipart, audio blob + appliance_id)
6. Fly.io gateway:
   a. Receives audio bytes in memory
   b. openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'en' })
   c. Audio bytes discarded immediately (Trust Constitution Rule 13)
   d. Transcript → diagnostic session pipeline (identical to text path from here)
7. Response: { transcript, session_id, status: 'processing' }
8. Client shows transcript for review, polls /diagnostic/session/{id}
```

### 5.2 Text Input Path

```
1. User types symptoms in DiagnosticInput.tsx
2. POST /api/v1/diagnostic/session { appliance_id, input_type: 'text', input_text }
3. Gateway: safety pre-filter → RAG → Claude → result
4. Response: { session_id, status: 'processing' }
5. Client polls until status != 'processing' (500ms interval, max 30s)
```

### 5.3 Diagnostic Engine — RAG + LLM Pipeline

```typescript
// services/gateway/src/services/rag.ts

async function retrieveChunks(
  query: string,
  appliance: { model_normalized: string; appliance_type: string; corpus_document_id?: string },
  k: number = 5
): Promise<CorpusChunk[]> {
  // 1. Embed the query
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVector = embedding.data[0].embedding;

  // 2. Try model-specific retrieval first (narrowest filter)
  if (appliance.model_normalized) {
    const { data } = await supabase.rpc('match_corpus_chunks', {
      query_embedding: queryVector,
      match_threshold: 0.75,
      match_count: k,
      filter_model: appliance.model_normalized,
    });
    if (data && data.length >= 3) return data;
  }

  // 3. Fall back to appliance_type retrieval (broader)
  const { data } = await supabase.rpc('match_corpus_chunks', {
    query_embedding: queryVector,
    match_threshold: 0.72,
    match_count: k,
    filter_model: null,
    filter_type: appliance.appliance_type,
  });
  return data ?? [];
}
```

```sql
-- Supabase function for pgvector retrieval
CREATE OR REPLACE FUNCTION match_corpus_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5,
  filter_model text DEFAULT NULL,
  filter_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, content text, section text, section_path text, page_ref int,
  make text, model_canonical text, appliance_type text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    cc.id, cc.content, cc.section, cc.section_path, cc.page_ref,
    cc.make, cc.model_canonical, cc.appliance_type,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM corpus_chunks cc
  WHERE
    (filter_model IS NULL OR cc.model_canonical = filter_model)
    AND (filter_type IS NULL OR cc.appliance_type = filter_type)
    AND 1 - (cc.embedding <=> query_embedding) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 5.4 Prompt Design

**System prompt** (injected once per session, never changes mid-session):

```
You are HomeOps Diagnostic Assistant — a trusted, safety-first appliance diagnostic AI.

APPLIANCE CONTEXT:
Make: {{make}}
Model: {{model}}
Appliance Type: {{appliance_type}}
Estimated Age: {{estimated_year}} (approx. {{age_years}} years old)

MANUAL CONTEXT (retrieved from service documentation):
{{#each chunks}}
---
Source: {{this.make}} {{this.model_canonical}} — {{this.section}} (p. {{this.page_ref}})
{{this.content}}
{{/each}}

RULES (non-negotiable):
1. Base your diagnosis on the manual context above. If the manual context does not cover the symptom, say so explicitly.
2. Safe steps must be executable by a non-technician homeowner. No steps requiring electrical panel work, gas line work, or refrigerant handling.
3. If the situation requires a licensed professional, say so clearly in safe_steps and set stop_here: true.
4. Confidence is your honest estimate of diagnostic accuracy given the symptoms described and the manual context quality.
5. You MUST respond with valid JSON only — no prose before or after. Schema is enforced.

RESPONSE FORMAT (strict JSON):
{
  "likely_issue": "string — one sentence",
  "confidence": 0.00-1.00,
  "safe_steps": [
    { "step": "string", "caution": "string or null" }
  ],
  "safety_flag": "string or null — if any immediate danger, describe it here",
  "stop_here": true|false,
  "source_citations": [
    { "manual": "string", "section": "string", "page": integer }
  ]
}
```

**User turn:**
```
User reports: "{{user_input_text}}"

Diagnose this issue for a {{appliance_type}} ({{make}} {{model}}, ~{{age_years}} years old).
```

### 5.5 Safety Stop Logic

**Pre-filter (runs BEFORE LLM — keyword-based, zero latency):**

```typescript
// packages/shared/src/constants/safetyKeywords.ts
export const IMMEDIATE_STOP_PATTERNS = [
  /gas\s*(smell|leak|odor)/i,
  /smell\s*(gas|rotten\s*egg)/i,
  /refrigerant\s*(leak|hissing)/i,
  /standing\s*water.{0,30}(outlet|plug|electric|wire|shock)/i,
  /sparks?\s*(coming|flying|shooting)/i,
  /flames?\s*(from|inside|visible)/i,
  /carbon\s*monoxide/i,
  /CO\s*detector\s*(alarm|going\s*off)/i,
];

export function safetyPreFilter(text: string): SafetyResult {
  const lower = text.toLowerCase();
  for (const pattern of IMMEDIATE_STOP_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        triggered: true,
        flag: getHumanReadableFlag(pattern),
        emergencyGuidance: getEmergencyGuidance(pattern),
      };
    }
  }
  return { triggered: false };
}
```

**Post-filter (validates LLM output):**

```typescript
// services/gateway/src/safety/postFilter.ts
function validateLLMOutput(result: DiagnosticResult): DiagnosticResult {
  // 1. If LLM sets stop_here: true but safety_flag is null — force flag
  if (result.stop_here && !result.safety_flag) {
    result.safety_flag = 'Professional service required. Do not proceed further.';
  }

  // 2. If safe_steps include banned actions — strip and flag
  const BANNED_STEP_PATTERNS = [
    /cut\s+the\s+(gas|supply)\s+line/i,
    /release\s+the\s+refrigerant/i,
    /touch\s+the\s+(live|hot)\s+wire/i,
  ];
  result.safe_steps = result.safe_steps.filter(s => {
    const banned = BANNED_STEP_PATTERNS.some(p => p.test(s.step));
    if (banned) result.safety_flag = `Removed unsafe step: ${s.step}`;
    return !banned;
  });

  // 3. Confidence floor: if < 3 corpus chunks matched, cap confidence at 0.60
  if (result._internal_chunks_matched < 3) {
    result.confidence = Math.min(result.confidence, 0.60);
  }

  return result;
}
```

**API-level enforcement:** Safety stops are enforced in server code at `services/gateway/src/safety/`. The client receives a `stop_here: true` response. The client UI must honor it but the enforcement is already complete — the API does not return safe_steps when stop_here is true.

### 5.6 Confidence Calibration

`confidence` (0.000 – 1.000) means: *"Given the symptoms described and the manual context retrieved, how likely is this the correct diagnosis?"*

Derived as:

```
base = LLM's self-assessed confidence (instructed in prompt to be calibrated, not optimistic)

adjustments:
  + 0.10 if top retrieved chunk similarity > 0.90 (strong manual match)
  - 0.10 if < 3 corpus chunks retrieved (sparse manual coverage)
  - 0.05 if appliance age > 12 years (more failure modes, less reliable)
  - 0.10 if model not found in corpus (general appliance_type fallback used)

final = clamp(base + adjustments, 0.10, 0.95)
```

The 0.95 cap is intentional: HomeOps never claims certainty. The 0.10 floor: we always return some estimate rather than refusing. Values below 0.50 render a visible low-confidence warning in UI.

---

## 6. Auth & Multi-Tenancy

### 6.1 Identity Layer: Supabase Auth

**Decision: Supabase Auth exclusively. No custom auth.** Rationale: Supabase Auth integrates directly with RLS, JWT claims are automatically available in Postgres RLS policies via `auth.uid()` and `auth.jwt()`. Zero custom auth infrastructure to maintain.

### 6.2 Account Types

Role stored in `public.profiles.role`. Two values: `broker_pm` | `consumer`.

**Implementation:** Role is set at signup and stored in `profiles.role`. The Fly.io gateway reads role from the JWT custom claim (set via Supabase Auth Hook — see §6.5). RLS policies enforce access boundaries; the gateway adds a second layer of role checking for write operations.

### 6.3 Broker/PM Onboarding

```
1. broker opens app → "Sign up as Agent/PM"
2. Email + password flow (Supabase Auth: signUpWithPassword)
3. Supabase sends email verification link
4. On verification: Auth Hook triggers → creates profiles row with role='broker_pm'
5. Broker must verify email before creating first passport
   → Gateway enforces: check auth.email_confirmed_at IS NOT NULL before passport write
6. First-time onboarding: enter full_name, brokerage_name, phone
7. Agent photo upload → Supabase Storage → profiles.agent_photo_url
```

### 6.4 Consumer Onboarding (Passport Invite Flow)

**Passwordless — consumer never sets a password at Phase 0/1.**

```
1. Consumer opens homeops.app/activate?t={token} in browser
2. Vercel page calls GET /api/v1/passports/{id}/activate on Fly.io
   → Validates token, returns passport preview
3. Consumer taps "Get My HomeOps"
4. If app installed: deep link opens app → homeops://activate?t={token}
   If not installed: browser continues (web activation flow)
5. Supabase Auth: signInWithOtp({ phone: recipient_phone })
   → Consumer enters 6-digit OTP sent to their phone
   → On success: session established
6. Auth Hook: creates profiles row with role='consumer', onboarded_via='passport_invite'
7. App calls POST /api/v1/passports/{id}/claim with token
   → Gateway seeds consumer's appliance access
8. Consumer lands on their appliance list — fully onboarded
```

### 6.5 Supabase Auth Hook (Custom JWT Claims)

Add role to JWT so Fly.io gateway can validate without a DB round-trip:

```sql
-- In Supabase Dashboard: Auth > Hooks > Custom Access Token Hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role, 'consumer')));
  
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

**JWT custom claims validated by Fly.io gateway:**

```typescript
// services/gateway/src/middleware/auth.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SUPABASE_JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

export async function verifyJWT(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, SUPABASE_JWKS, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  });
  return payload; // contains: sub (user_id), email, user_role, exp, iat
}
```

### 6.6 RLS Policy Summary

| Table | Broker reads | Broker writes | Consumer reads | Consumer writes |
|-------|-------------|--------------|----------------|-----------------|
| profiles | Own row | Own row | Own row | Own row |
| properties | Own (created_by) | Own | Via activated passport | ❌ |
| appliances | On own properties | On own properties | Via activated passport | ❌ |
| passports | Own | Own | Own activated passport only | ❌ |
| passport_invites | Own passports' invites | ❌ (gateway only) | Own claimed invite | ❌ |
| diagnostic_sessions | ❌ (Trust Constitution §11) | ❌ | Own sessions | Own sessions |
| corpus_* | Read (authenticated) | ❌ (service_role only) | Read (authenticated) | ❌ |

---

## 7. Vercel Web Layer (Next.js)

### 7.1 Pages for Phase 0

| Route | Type | Auth | Description |
|-------|------|------|-------------|
| `/p/[token]` | SSG + ISR | None | Public passport view — shareable link |
| `/activate` | Client component | None | Consumer activation landing page |
| `/dashboard` | SSR | broker_pm | Broker passport list |
| `/dashboard/passport/[id]` | SSR | broker_pm | Passport detail + invite management |
| `/api/qr/[token]` | API Route | None | QR code PNG generation |

### 7.2 Data Access Pattern

```
Next.js page          →  Supabase (direct, SSR)   : property data, appliance list, passport status
Next.js API route     →  Fly.io gateway            : any AI/diagnostic calls (with service auth)
Client component      →  Supabase (browser client) : real-time updates, auth state
/p/[token] (SSG)      →  Supabase (build-time)     : pre-render passport; ISR revalidates hourly
```

**Why Supabase direct from Next.js (not always via gateway):**  
Read-only data (passport details, appliance lists) does not require the gateway's business logic or API key protection. Direct Supabase queries from Next.js server components are faster and simpler. Only AI calls and write operations go through the gateway.

### 7.3 Public Passport View (`/p/[token]`)

```tsx
// apps/web/app/p/[token]/page.tsx
export const revalidate = 3600; // ISR: regenerate hourly

export async function generateStaticParams() {
  // Pre-render recent passports at build time (optional optimization)
  return [];
}

export default async function PassportPublicView({
  params: { token }
}: { params: { token: string } }) {
  // Validate token via Fly.io (public endpoint — no auth required)
  const passport = await fetch(`${GATEWAY_URL}/api/v1/passports/public/${token}`).then(r => r.json());

  if (!passport) return notFound();

  return <PassportPublicView passport={passport} />;
}
```

The public view shows: property address, appliance list (make/model/estimated age/recall status), broker branding. No diagnostic data, no personal consumer data. This page is the shareable artifact the broker sends at closing.

### 7.4 QR Code Generation

```typescript
// apps/web/app/api/qr/[token]/route.ts
import QRCode from 'qrcode';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = `https://homeops.app/activate?t=${params.token}`;
  const png = await QRCode.toBuffer(url, {
    type: 'png',
    width: 400,
    margin: 2,
    color: { dark: '#1a1a1a', light: '#ffffff' },
    errorCorrectionLevel: 'H', // High — allows for logo overlay
  });

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable', // QR never changes
    },
  });
}
```

QR codes are generated on-demand from the Vercel API route and cached at CDN edge permanently (token → URL mapping never changes). The broker's invite screen in the mobile app uses this URL to display the QR code inline.

---

## 8. Infrastructure & Deployment

### 8.1 Fly.io — API Gateway

**Runtime:** Bun + Hono. *Rationale: Bun is ~4x faster than Node.js for cold starts, handles binary blobs (audio) natively, and its `fetch`-based API matches Web standards exactly. Hono is zero-dependency, TypeScript-first, and has Bun-native adapters.*

**`fly.toml`:**
```toml
app = "homeops-gateway"
primary_region = "iad"  # us-east (IAD = Ashburn VA — closest to Lexington KY)

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  
  [[services.ports]]
    port = 80
    handlers = ["http"]

  [services.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512  # Upgrade to 1GB if whisper audio buffering causes OOM

[mounts]  # None — stateless gateway
```

**`services/gateway/Dockerfile`:**
```dockerfile
FROM oven/bun:1.1-alpine
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production
COPY src/ ./src/
EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]
```

**Secrets (set via `fly secrets set`):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_VISION_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
RESEND_API_KEY
```

### 8.2 Vercel — Next.js Web

**Deploy config:**
- Framework: Next.js (auto-detected)
- Root directory: `apps/web`
- Build command: `cd ../.. && pnpm turbo build --filter=web`
- Output directory: `.next`
- Node version: 20.x

**Edge vs. Serverless:**  
- `/p/[token]` — Static + ISR (no edge runtime needed; CDN handles it)  
- `/api/qr/[token]` — Edge Runtime (fast, globally distributed, no external calls needed)  
- `/dashboard/*` — Node.js Serverless (Supabase server client requires Node crypto APIs)  
- `/activate` — Client component (no server-side auth required before activation)

**Environment variables (Vercel dashboard):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # Server-side only
GATEWAY_URL=https://api.homeops.app
NEXT_PUBLIC_GATEWAY_URL=https://api.homeops.app
```

### 8.3 Supabase — Database + Auth + Storage

**Project setup:**
1. Create Supabase project in `us-east-1` region (closest to Fly.io `iad`)
2. Enable pgvector: `create extension vector;` (in SQL editor or migration)
3. Enable pg_trgm: `create extension pg_trgm;`
4. Configure Auth: enable email + SMS (Twilio) providers
5. Set Auth Hook: custom_access_token_hook (from §6.5)
6. Storage buckets:
   - `appliance-photos` (public read, authenticated write)
   - `warranty-docs` (private, user-scoped)
   - `corpus-raw` (private, service_role only)

**Migration strategy:**
```bash
# All schema changes via Supabase CLI migrations
supabase migration new add_appliances_table
# Edit supabase/migrations/{timestamp}_add_appliances_table.sql
supabase db push  # Apply to remote
supabase db pull  # Sync remote changes back to local
```

**Never run raw SQL in Supabase dashboard for schema changes.** All DDL lives in version-controlled migrations.

**Type generation:**
```bash
supabase gen types typescript --project-id {project_id} > packages/supabase/src/types.ts
```
Run after every migration. Types used by both mobile and web via `@homeops/supabase` package.

### 8.4 CI/CD — GitHub Actions

**`.github/workflows/gateway-deploy.yml`:**
```yaml
name: Deploy Gateway to Fly.io
on:
  push:
    branches: [main]
    paths: ['services/gateway/**', 'packages/shared/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        working-directory: services/gateway
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**`.github/workflows/web-deploy.yml`:**
```yaml
name: Deploy Web to Vercel
on:
  push:
    branches: [main]
    paths: ['apps/web/**', 'packages/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build --filter=web
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: apps/web
```

**`.github/workflows/mobile-eas.yml`:**
```yaml
name: EAS Build (Mobile)
on:
  push:
    branches: [main]
    paths: ['apps/mobile/**', 'packages/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas build --platform all --non-interactive --profile production
        working-directory: apps/mobile
```

**`apps/mobile/eas.json`:**
```json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "buildConfiguration": "Release" }
    },
    "production": {
      "autoIncrement": true,
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "apk" }
    }
  }
}
```

### 8.5 Environment Strategy

| Environment | Supabase | Fly.io | Vercel | Mobile |
|-------------|----------|--------|--------|--------|
| **dev** | Local (`supabase start`) | `fly deploy --app homeops-gateway-dev` | `vercel dev` | Expo Go + localhost gateway |
| **staging** | Supabase staging project | `homeops-gateway-staging.fly.dev` | Vercel preview branch | EAS `preview` profile |
| **prod** | Supabase prod project | `api.homeops.app` | `homeops.app` | EAS `production` profile |

**Dev local setup:**
```bash
# Terminal 1: Supabase local
supabase start  # runs PostgreSQL + Auth + Storage locally

# Terminal 2: Gateway local
cd services/gateway && bun dev  # watches for changes

# Terminal 3: Web local
cd apps/web && pnpm dev

# Terminal 4: Mobile
cd apps/mobile && npx expo start
# Point to localhost gateway via .env.local
```

---

## 9. Phase 0 Build Sequence

Ordered by dependency chain. Each task is one focused session (2–6 hours). Sequence minimizes rework and reaches broker demo as fast as possible.

**North Star for Phase 0:** A broker can walk through a real home, scan 10 appliance model plates, create a passport, and send an invite link. That demo must work end-to-end.

---

**Session 1 — Infrastructure Foundation**
- Create Supabase project (prod + staging)
- Enable pgvector, pg_trgm extensions
- Apply migration: all DDL from §2 (users/properties/appliances/passports/invites/corpus)
- Configure Supabase Auth: email provider, custom JWT hook
- Set up Fly.io app: `fly launch` in `services/gateway`
- Set all secrets on Fly.io
- Deploy gateway with health check endpoint (`GET /health → 200`)
- Verify: `curl https://api.homeops.app/health` returns `{"status":"ok"}`

---

**Session 2 — Monorepo Scaffold**
- Init pnpm workspace + Turborepo
- Create `packages/shared`: TypeScript types for all entities + API shapes
- Create `packages/supabase`: client factory + run `supabase gen types`
- Create `services/gateway` Bun/Hono skeleton: auth middleware, empty route handlers
- Create `apps/mobile` via `npx create-expo-app@latest`
- Create `apps/web` via `npx create-next-app@latest`
- Wire all packages together; confirm `pnpm turbo build` passes with no errors
- Commit: first green monorepo build

---

**Session 3 — Corpus: Model Registry Bootstrap (Phase 0 minimum)**
- Download EnergyStar Certified Products CSV (free, no legal risk)
- Write `scripts/bootstrap_phase0.py`: parse CSV → normalize model numbers → upsert `model_registry`
- Pull CPSC recall API: `https://www.saferproducts.gov/RestWebServices/Recall?format=json`
- Write `scripts/load_cpsc_recalls.py`: load all appliance recalls → populate `cpsc_recall_ids` in model_registry
- Target: 150K+ model_registry rows, 100% CPSC recall coverage
- Verify: run 20 real appliance model numbers (from photos you take in your home) → all resolve

---

**Session 4 — Gateway: Walk-Through Scan Endpoint**
- Implement `POST /api/v1/walk-through/scan` in Fly.io gateway
- Wire Google Vision API client
- Implement model number normalization (regex pipeline per corpus build plan §4.7)
- Implement model_registry lookup: exact → pg_trgm fuzzy → family prefix fallback
- Return structured response including recall_status from CPSC data
- Test: POST a real model plate photo → confirm correct make/model/year returns

---

**Session 5 — Supabase Auth + Profiles**
- Implement Supabase Auth Hook (custom JWT claims with user_role)
- Write Auth trigger: on new user signup → create `profiles` row with correct role
- Implement gateway auth middleware: JWT verification against Supabase JWKS
- Implement role guard middleware for broker_pm routes
- Test: sign up as broker → JWT contains `user_role: 'broker_pm'` → confirmed via gateway log

---

**Session 6 — Gateway: Passport CRUD**
- Implement `POST /api/v1/passports`: create passport + appliance associations
- Implement `GET /api/v1/passports/{id}`: return passport with appliances
- Implement RLS test: broker A cannot read broker B's passport (confirm 403)
- Implement `PUT /api/v1/passports/{id}`: update branding snapshot

---

**Session 7 — Gateway: Invite Flow**
- Implement `POST /api/v1/passports/{id}/invite`
- Wire Twilio client: SMS delivery
- Wire Resend client: email delivery (branded HTML template)
- Implement QR code generation (return `qr_code_url`)
- Implement `GET /api/v1/passports/{id}/activate?t={token}`: token validation, return passport preview
- Implement `POST /api/v1/passports/{id}/claim`: consumer account seeding
- Test full invite flow: create passport → send SMS → click link → validate token → claim

---

**Session 8 — Mobile: Auth + Navigation Shell**
- Implement Expo Router layout structure (all route files, even if screens are stubs)
- Implement `useAuth` hook (Supabase session management)
- Implement role-based routing: broker_pm → `(broker)` stack, consumer → `(consumer)` stack
- Implement sign-in screen (broker: email+password; consumer: OTP)
- Implement sign-up screen (broker registration)
- Verify: sign in as broker → lands on broker dashboard stub

---

**Session 9 — Mobile: Walk-Through Camera + Scan**
- Implement `ModelPlateScan.tsx` using expo-camera
- Implement photo capture + base64 encode
- Wire to `POST /api/v1/walk-through/scan` in gateway
- Implement `confirm/[scanId].tsx`: show scan result, allow manual correction
- Implement `useCamera` hook (permission handling, camera lifecycle)
- Test: walk through your own home, scan 5 appliances → all resolve correctly

---

**Session 10 — Mobile: Property + Appliance Creation**
- Implement property address form with Google Places autocomplete (`react-native-google-places-autocomplete`)
- Wire `POST /api/v1/properties` (direct Supabase write is fine for property creation)
- Implement appliance list accumulation during walk-through (local state before passport creation)
- Implement appliance photo upload → Supabase Storage
- Implement walk-through review screen: see all appliances, edit before confirming

---

**Session 11 — Mobile: Passport Creation + Invite Send**
- Implement "Create Passport" flow: review screen → `POST /api/v1/passports`
- Implement broker branding form (from profile settings)
- Implement invite send screen: enter buyer phone/email → `POST /api/v1/passports/{id}/invite`
- Display QR code from invite response
- Implement broker dashboard: passport list with invite status badges
- **Broker demo milestone: end-to-end walk-through → passport → invite**

---

**Session 12 — Web: Public Passport View**
- Implement `apps/web/app/p/[token]/page.tsx` (ISR public passport)
- Implement `PassportPublicView.tsx` component: property, appliances, broker branding
- Implement `/api/qr/[token]` route (QR PNG generation)
- Implement `apps/web/app/activate/page.tsx` (consumer landing, read passport preview, OTP prompt)
- Test: broker sends invite → buyer opens link → sees passport in browser

---

**Session 13 — Mobile: Consumer Activation Deep Link**
- Implement `app/activate.tsx` deep link handler
- Handle `homeops://activate?t={token}` → call gateway → display passport preview
- Implement Supabase OTP auth for consumer
- Call `POST /api/v1/passports/{id}/claim` after auth
- Consumer lands on `(consumer)/home.tsx` with appliances pre-loaded
- Test: full QR scan → app install prompt → OTP → appliance list visible

---

**Session 14 — CI/CD + Environments**
- Configure GitHub Actions: gateway-deploy, web-deploy, mobile-eas workflows
- Set up staging environment (staging Supabase project, staging Fly.io app, Vercel preview)
- Set all secrets in GitHub repo settings
- Verify: push to main → all three deployments succeed
- Verify: staging is isolated from prod (separate Supabase project, separate secrets)

---

**Session 15 — End-to-End Demo Hardening**
- Run full broker walk-through demo on 10 real appliances
- Fix any OCR normalization failures (add model variants to registry)
- Fix any invite delivery issues (SMS/email formatting, deep link routing)
- Fix any RLS edge cases (cross-account data leaks)
- Load test: 50 concurrent model_registry lookups (confirm < 50ms p50)
- **Phase 0 complete: broker demo ready**

---

## 10. Open Architectural Questions

Genuine unresolved technical decisions only. These require a spike before the relevant session begins.

---

**OAQ-01: Google Vision API vs. AWS Rekognition for model plate OCR**

*Why unresolved:* Both are viable. Google Vision has better text detection on curved/embossed surfaces (common on appliance model plates). AWS Rekognition is cheaper at volume and integrates naturally if you later use AWS for other services. Both require API keys on the gateway.

*Spike required:* Test both APIs on 50 real model plate photos from different appliance types. Measure extraction accuracy and character error rate. Pick the winner. *Do not start Session 4 without this data.*

*My lean:* Google Vision. The Detect Text API (not Document AI) handles unstructured plate text well. AWS Rekognition DetectText is close but Google has a documented edge on non-document text.

---

**OAQ-02: Async session processing — polling vs. WebSocket vs. Supabase Realtime**

*Why unresolved:* The diagnostic session is async (5–8s LLM call). Three options:
- **Polling** (current spec): client calls `GET /session/{id}` every 500ms. Simple. Works. Slightly chatty.
- **WebSocket**: Fly.io keeps connection open, pushes result. More complex, better UX.
- **Supabase Realtime**: gateway updates `diagnostic_sessions.status` in DB; mobile client subscribes to row changes via Supabase Realtime. Zero polling, clean architecture — but adds a Supabase Realtime subscription dependency.

*My lean:* Supabase Realtime. The gateway already writes to Supabase; subscribing to a row change in the mobile client is 5 lines of code. No polling, no WebSocket infra on Fly.io. But this needs a quick prototype to confirm Realtime latency is acceptable (should be <200ms).

*Spike required:* Confirm Supabase Realtime works reliably in React Native (supabase-js v2 Realtime subscriptions in Expo). 30 minutes to test.

---

**OAQ-03: Consumer web fallback — how complete does it need to be at Phase 0?**

*Why unresolved:* The activation flow (homeops.app/activate) must work in the browser for consumers who don't install the app. But: does the full appliance dashboard need to work in the browser? Or do we show a "Download the App" prompt after activation?

*Decision needed before Session 12.* My recommendation: web activation only — browser handles token validation, OTP auth, and account creation. After claim, prompt "Download HomeOps to access your appliances." The consumer app dashboard is mobile-only in Phase 0. This is simpler and preserves mobile-first positioning.

---

**OAQ-04: Twilio Verify vs. Twilio Messaging for consumer OTP**

*Why unresolved:* Supabase Auth supports Twilio for SMS OTP natively (Supabase Auth settings → SMS provider → Twilio). This uses Twilio's raw messaging API. Twilio Verify is Supabase's preferred integration but Verify has per-verification pricing ($0.05/check vs. $0.0079/SMS). At Phase 0 volume (< 1,000 activations), cost difference is negligible. At Phase 2 scale, Verify is more expensive.

*Decision:* Use Twilio SMS (not Verify) for cost scaling. Configure Supabase Auth to use Twilio Messaging directly. One-time setup, covers Phase 0–2.

---

**OAQ-05: pgvector HNSW index parameters at Phase 1 corpus scale**

*Why unresolved:* The HNSW index parameters (`m=16, ef_construction=64`) in the DDL are correct for Phase 0 model registry scale. At Phase 1 (24K manuals × ~200 chunks = ~5M vectors), these parameters may need tuning:
- `m`: higher values (24–32) improve recall at the cost of memory/build time
- `ef_construction`: higher (128+) improves index quality at the cost of build time
- `ef_search`: runtime parameter controlling recall vs. speed tradeoff

*Spike required before Phase 1 corpus ingestion:* Load 500K test vectors into staging Supabase. Benchmark query latency and recall at different HNSW parameters. Target: p95 retrieval < 100ms, recall@5 > 0.85. Run this spike in parallel with Phase 0 Sessions 1–7 — doesn't block broker demo.

---

**OAQ-06: Expo Router deep link handling — universal links vs. custom scheme**

*Why unresolved:* The activate link (`homeops.app/activate?t={token}`) needs to open the app if installed, or the browser if not. Two approaches:
- **Universal Links (iOS) / App Links (Android)**: `homeops.app` domain serves an Apple App Site Association file + Android assetlinks.json → browser URLs open the app natively.
- **Custom scheme** (`homeops://activate?t={token}`): simpler but requires the broker to send the custom scheme URL, which looks odd in SMS.

*My recommendation:* Universal links. The SMS/email contains `https://homeops.app/activate?t={token}` — looks clean and professional. If app is installed, iOS/Android intercepts and opens app. If not, browser handles it. Expo Router supports universal links with `expo-linking` + `intentFilters` in `app.json`. *Requires domain verification via Apple AASA file on Vercel* — do this in Session 12.

---

*HomeOps Architecture v1.0 — Winston (BMAD) — 2026-07-16*  
*"The blueprint is done. Build the thing."*
