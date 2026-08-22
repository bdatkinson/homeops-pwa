# HomeOps Vendor Management Policy

**Version:** 0.1 (DRAFT — not yet approved)
**Owner:** HomeOps (solo founder)
**Last reviewed:** 2026-08-22 · **Review cadence:** annual + on new vendor onboarding

> DRAFT NOTICE: First draft for SOC 2 readiness. Approve and date before treating as a control.

## 1. Purpose

Define how HomeOps selects, assesses, contracts, and monitors the vendors that touch the Year-1 stack. HomeOps is a small company with a big attack surface by proxy: every vendor with a key or a webhook into our system is a control point.

## 2. Vendor inventory (current)

| Vendor | Service | Data we entrust | Risk tier | Key facts to verify annually |
|---|---|---|---|---|
| **Supabase** (project `qftesnsddnhumzmuelns`, ca-central-1) | Postgres + Auth + RLS | **All production data incl. tenant PII** | HIGH | SOC 2/ISO 27001 attestation on file; DPA signed; backup/PITR settings; region ca-central-1 (Canada — data-residency relevant for CA tenants); service-role key access |
| **Vercel** | Next.js hosting/edge | Web app code, minimal PII (server-rendered pages), deploy tokens | MEDIUM | SOC 2 report; VERCEL_OIDC_TOKEN usage; env variable security; preview-deploy access |
| **Fly.io** | Gateway hosting | Runtime env (secrets incl. Supabase service key, Twilio), request logs | HIGH | SOC 2/ISO report; secret management (fly secrets encrypted at rest); machine auto-restart |
| **Twilio** | SMS + status callbacks | Tenant phone numbers (sent TO Twilio), message bodies, delivery metadata | HIGH | SOC 2 report; DPA; message retention settings; STOP-opt-out compliance; abuse handling |
| **Resend** | Invite email | Invitee emails, passport links | MEDIUM | SOC 2 report; DPA; retention of email logs |
| **Anthropic / OpenAI / Google Vision** | Model APIs (diagnostics, OCR) | Diagnostic text (may include appliance descriptions — avoid sending PII by design) | MEDIUM | Data-retention/training opt-out settings (API terms: no training on API data by default — confirm); prompt content policy |
| **Property Meld** (mock until P4) | Work-order webhook source | Tenant name/phone via webhook payload (in live mode) | HIGH (future) | HMAC secret exchange; sandbox → live cutover plan; data sharing agreement |
| **PostHog** | Product analytics (consent-gated) | Anonymous product events only, post-consent | LOW | Consent-first config (verified in `apps/web/lib/consent.ts`); no PII fields configured (verify in dashboard) |

## 3. Onboarding requirements (new vendor)

1. **Tier the vendor** (HIGH if it stores/processes tenant PII or holds a production secret).
2. **Collect:** SOC 2 / ISO 27001 report (or equivalent attestation) for HIGH-tier vendors; security contact; data-processing location.
3. **Contract:** require a DPA for any vendor storing tenant PII; review their breach-notification terms.
4. **Provision least-privilege:** scoped API keys, IP allowlists where supported, no shared accounts.
5. **Record the decision** in this file's vendor table (add row) — the table is the vendor register.

## 4. Ongoing monitoring (annual)

- Re-fetch HIGH-tier vendors' SOC 2/ISO reports; note material changes (new subprocessors, region moves).
- Review active API keys/secrets: rotate per schedule (see §5), revoke unused.
- Confirm billing/account ownership is a single founder-controlled account (no orphaned service accounts).
- Check vendor security-advisory feeds for our in-use products (Next.js, Hono, Supabase, Bun) — quarterly.

## 5. Secret & key management per vendor

| Secret | Location today | Rotation cadence (draft) | Notes |
|---|---|---|---|
| Supabase service-role key | Fly secrets (gateway env) | At-least-annual + on any exposure | Never in browser; audit who can read Fly secrets (founder only) |
| Supabase anon key | Vercel env (web) | On rotation of project keys | Public by design — low risk |
| Twilio auth token | Fly secrets | Annual + on suspicion | Used for both REST auth and status-callback HMAC verification |
| Receipt signing key | Fly env (`HOMEOPS_RECEIPT_KEY`) / dev machine file | Annual; rotate via `receipt_keys` registry (new key, `revoked_at` on old, seed script `scripts/seed-receipt-key.ts`) | Public keys remain readable for verification after rotation |
| Vercel OIDC token | Local `.env.local` (empty today) | On Vercel project settings change | Used for deploy identity |
| Resend API key | Fly secrets | Annual | |
| Anthropic/OpenAI/Google keys | Fly secrets | Annual | |

## 6. Offboarding / exit

- Vendor termination → revoke all keys first, then close accounts; export any required data; update this register; note subprocessor dependencies (e.g., Supabase → AWS region) that survive the vendor.

## 7. Related documents

Information Security Policy (§4.6) · Access Control Policy (secrets) · Data Handling/Retention (what vendors may store) · `01-tsc-gap-analysis.md` (CC9.2) · `05-remediation-roadmap.md` (R-15 vendor assessments + DPAs)
