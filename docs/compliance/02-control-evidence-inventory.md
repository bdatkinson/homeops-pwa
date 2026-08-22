# HomeOps — Control Evidence Inventory

**Status:** DRAFT / UNVERIFIED — inventory of *existing* controls with evidence pointers. Every row traces to a file in `~/homeops-pwa` or a live endpoint verified 2026-08-22. This is the starting point for the auditor's evidence request list; it is not itself evidence.

**How to use:** for each control family, the "Evidence" column gives the repo path. When the auditor asks for evidence, pull the current artifact at that path (plus screenshots/CI logs where noted).

---

## 1. Identity & Access Management

| Control | Family (TSC) | Evidence | Notes |
|---|---|---|---|
| Supabase Auth (magic link/OTP, email) | CC6.1 | `supabase/migrations/20260717000002_auth_profiles_hooks.sql`; `services/gateway/src/routes/public.ts` (`/invites/claim`) | Consumer sign-in via OTP; `shouldCreateUser` path. |
| JWT verification (ES256, JWKS, aud/exp) | CC6.1 | `services/gateway/src/lib/jwt.ts` | JWKS cache 1h TTL; rejects wrong `aud`, expired, bad signature. |
| Role-based auth middleware | CC6.1, CC6.2 | `services/gateway/src/middleware/auth.ts` | `requireAuth` + `requireRole("broker_pm"\|"consumer")`; role from JWT claim or DB fallback. |
| Role claim injection | CC6.2 | `supabase/migrations/20260717000002_auth_profiles_hooks.sql` (custom_access_token_hook) | `SECURITY DEFINER` function granted to `supabase_auth_admin`. |
| Single-purpose intake tokens (72h TTL, no PII in URL) | CC6.1, C1.1 | `services/gateway/src/lib/property-meld/intake.ts`; `routes/public.ts` (`/intake/public/:token`, 410 on expiry) | 18-byte random + scoped hash; PII-safe projection on read. |
| Invite token flow with expiry + claim guard | CC6.2, CC6.3 | `services/gateway/src/routes/public.ts` (`/invites/claim`); migration `20260716000001_initial_schema.sql` (`passport_invites`) | 409 already-claimed, 410 expired. |
| MFA on admin consoles (Supabase/Vercel/Fly) | CC6.1 | UNVERIFIED — platform feature, not evidenced in repo | Confirm enabled in each dashboard; record screenshot for audit. |

## 2. Data Protection (at rest / in transit / RLS)

| Control | Family (TSC) | Evidence | Notes |
|---|---|---|---|
| RLS enabled on all 13 tables | CC6.6 | `supabase/migrations/*.sql` — every table has `ENABLE ROW LEVEL SECURITY` (verified via grep across migrations) | See §5 table-by-table. |
| Least-privilege policies (self-read/self-update, broker scoped, service_role bypass only where needed) | CC6.6 | `20260716000001_initial_schema.sql` (profiles/properties/appliances/passports policies), `20260717000003_passport_crud_policies.sql` (service_role FOR ALL), `20260822000001_work_order_intake.sql`, `20260822000002_sms_message_status.sql` | service_role policies documented as gateway-bypass seam. |
| CORS allowlist | CC6.6 | `services/gateway/src/index.ts` (allowedOrigins + vercel preview regex, credentials: true) | Finding F-04: disallowed origins get `c.req.url` back, not a strict block. |
| TLS in transit | CC6.6, C1 | `services/gateway/fly.toml` (`force_https = true`); Vercel default TLS | Verified live: https on gateway + site. |
| Secrets via environment, `.env*` gitignored | CC6.5 | `.gitignore` (`.env*`, `!.env.example`), `services/gateway/.env.example` | Only `VERCEL_OIDC_TOKEN=` present in local `.env.local` (empty). |
| Receipt signing key (Ed25519) | CC6.5, PI1 | `services/gateway/src/lib/receipt-signer.ts` (env `HOMEOPS_RECEIPT_KEY` or dev key file) | Dev auto-generates key at `~/.hermes/homeops-receipt-signing.key` — local machine key = risk R7. |

## 3. Integrity & Processing

| Control | Family (TSC) | Evidence | Notes |
|---|---|---|---|
| Signed diagnostic receipts (canonical JSON, manifest hash, Ed25519) | PI1.1, PI8.1, CC1.5 | `services/gateway/src/lib/receipt-signer.ts` (+ 6 tests in `receipt-signer.test.ts`) | "Commercial firebreak": fulfillment only downstream of a confirmed signed receipt. |
| Public key registry for receipt verification | C1, PI1 | `supabase/migrations/20260823000002_receipt_keys.sql` (anon/authenticated read of active keys; service_role writes); `scripts/seed-receipt-key.ts` | Public keys public by design; rotation via `revoked_at`. |
| Deterministic safety kernel (fail-closed dispositions) | PI1, CC1.5, CC5.1 | `services/gateway/src/lib/safety-kernel.ts` (+ 17 tests) | No LM authorizes physical action; hard exclusions machine-checked. |
| Webhook intake: normalize → classify → persist (idempotent) | PI2.1, PI4.1 | `services/gateway/src/lib/property-meld/intake.ts`, `mock.ts`, `routes/webhooks.ts` (+ 15 intake tests, 4 webhook route tests) | Unique index `uq_work_order_intake_wo_event` prevents double-persist. |
| Twilio status callback → immutable history + fold-back | PI4.2, PI5.1, CC7.1 | `routes/webhooks.ts` (`/twilio/status`), migration `20260822000002_sms_message_status.sql` | One row per callback; terminal failures fold into invites. |

## 4. Vendor / External Input Validation

| Control | Family (TSC) | Evidence | Notes |
|---|---|---|---|
| Twilio HMAC-SHA1 signature validation (timing-safe) | CC6.6, CC7.2 | `services/gateway/src/routes/webhooks.ts` (`/twilio/status`) | Rebuilds public URL from forwarded headers behind Fly proxy. **Finding F-03:** fails OPEN (warn only) when `TWILIO_AUTH_TOKEN` unset. |
| Property Meld webhook signature check | CC6.6 | `services/gateway/src/lib/property-meld/mock.ts` (`verifySignature`) | **Finding F-02:** mock returns `true` for everything; must be real HMAC when live (P4). Mock simulator 404s in live mode. |
| Invite email / SMS content escaping | PI4.2, CC8 | `services/gateway/src/lib/notify.ts` (`escHtml`) | HTML-escapes user-provided fields in email. |

## 5. RLS table-by-table matrix (evidence for CC6.6)

| Table | RLS | Key policies |
|---|---|---|
| profiles | ✅ | self read/update; service_role read-all (hook) |
| properties | ✅ | broker read/insert/update; consumer read (shared) |
| appliances | ✅ | broker read/insert/update; consumer read |
| passports | ✅ | broker read/insert/update; consumer read |
| passport_appliances | ✅ | broker read; service_role all |
| passport_invites | ✅ | broker read; token read; consumer update; service_role all |
| diagnostic_sessions | ✅ | owner read/insert/update; consumer_own_sessions |
| corpus_documents / corpus_chunks | ✅ | authenticated read |
| model_registry | ✅ | authenticated read |
| cpsc_recalls | ✅ | authenticated read |
| work_order_intake | ✅ | service_role write; broker_pm read own property intake |
| sms_message_status | ✅ | service_role only (no consumer access) |
| receipt_keys | ✅ | public (anon) + authenticated read of active keys; service_role write |

## 6. Availability & Ops

| Control | Family (TSC) | Evidence | Notes |
|---|---|---|---|
| `/health` endpoint + Fly HTTP checks (30s, grace 5s) | A1.1, CC7.1 | `services/gateway/src/index.ts`; `fly.toml` | Verified live: `{"status":"ok","service":"homeops-gateway","version":"0.0.1"}` (2026-08-22). |
| force_https + auto start/stop machines | A1.1 | `fly.toml` | min_machines 0 → cold starts. |
| Immutable deploys (Vercel) + versioned migrations | CC8.1, A1.2 | `vercel.json`, `supabase/migrations/` | Rollback = redeploy previous commit (untested as a procedure). |
| Supabase platform backups (daily/PITR) | A1.2 | UNVERIFIED (platform) | Must confirm settings in dashboard + run a restore drill (R-14). |

## 7. Privacy & Consent

| Control | Family | Evidence | Notes |
|---|---|---|---|
| Analytics consent gate (capability probe before any SDK) | Privacy (Trust #5) | `apps/web/lib/consent.ts`, `apps/web/lib/analytics.ts`, `components/ConsentBootstrap.tsx` | localStorage trail, best-effort first-party beacon; PostHog OFF unless key set + consent. |
| Privacy-by-design product commitments | Privacy | `docs/planning/homeops-app-development-document-v1.0.md` (10-Point Trust Constitution, data-captured disclosures, hashed correlation not raw contact lists) | Product-level; not yet a published policy. |

## 8. Test evidence (CC4.1 — monitoring of controls)

| Suite | Tests | Covers |
|---|---|---|
| `lib/property-meld/intake.test.ts` | 15 | classification, token gen, SMS body, link build |
| `lib/receipt-signer.test.ts` | 6 | sign/verify, tamper detection, canonical JSON |
| `lib/safety-kernel.test.ts` | 17 | dispositions, hard exclusions, fail-closed ordering |
| `routes/public-intake.test.ts` | 7 | intake public endpoints, expiry, idempotency |
| `routes/webhooks.test.ts` | 4 | webhook → normalize → persist → mock SMS → 201 |
| **Total** | **49** | |

## 9. Known findings surfaced during inventory (cross-ref `05-remediation-roadmap.md`)

- F-01 No rate limiting on public endpoints (intake, invites/claim, webhooks)
- F-02 Property Meld webhook mock mode: `verifySignature` returns true for all payloads (until P4)
- F-03 Twilio callback fails open when `TWILIO_AUTH_TOKEN` is unset (warn, then accept)
- F-04 CORS returns `c.req.url` for disallowed origins instead of strict rejection
- F-05 Intake tokens stored raw in `work_order_intake.token` (should store a hash; raw returned once)
- F-06 No structured logging / log retention (console.log only; Fly logs ephemeral)
- F-07 Env-var naming drift: `.env.example` uses `TWILIO_PHONE_NUMBER`, code reads `TWILIO_FROM_NUMBER`
- F-08 No CI pipeline / SAST / dependency scanning (no `.github/workflows`)
- F-09 No monitoring/alerting to the founder (no uptime or error alerts)
- F-10 No published privacy policy / terms on the live site (verified 2026-08-22)

*This inventory is a draft and covers design/point-in-time state. Re-verify each row before the audit engagement.*
