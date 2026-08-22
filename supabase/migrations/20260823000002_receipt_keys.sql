-- ============================================================
-- HomeOps — Migration: receipt_keys (public key registry)
--
-- Signed Diagnostic Receipts carry a key_id; ANY downstream verifier
-- (enterprise agents, auditors, the web app) must be able to fetch the
-- matching Ed25519 public key WITHOUT credentials — public keys are public
-- by design. Writes are service-role only (gateway / ops tooling).
--
-- Seed with the current signing key:
--   bun services/gateway/scripts/seed-receipt-key.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.receipt_keys (
  key_id          TEXT PRIMARY KEY,
  public_key_spki TEXT NOT NULL,          -- base64 DER SPKI (Ed25519)
  name            TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

ALTER TABLE public.receipt_keys ENABLE ROW LEVEL SECURITY;

-- Public keys are readable by anyone (that is the point of the registry).
CREATE POLICY "receipt_keys_public_read" ON public.receipt_keys
  FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "receipt_keys_auth_read" ON public.receipt_keys
  FOR SELECT TO authenticated
  USING (active = true);
