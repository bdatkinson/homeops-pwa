# HomeOps — SOC 2 (Type I) Trust Services Criteria Gap Analysis

**Status:** DRAFT / UNVERIFIED — internal readiness work, not an audit claim
**Owner:** HomeOps (solo founder)
**Date:** 2026-08-22
**Scope:** Year-1 live stack (see below). Security category (CC1–CC9) is mandatory for any SOC 2; Availability (A1), Confidentiality (C1), and Processing Integrity (PI1–PI9) are assessed as *candidate* in-scope categories. Privacy (P-series) is out of scope for the first Type I but called out where the stack touches it.

---

## 1. Scope and system description

| Component | Purpose | Host / Region | Evidence source |
|---|---|---|---|
| Next.js 16 PWA (www.homeops.biz) | Tenant zero-install app + broker/PM dashboard | Vercel (edge + serverless) | `apps/web/`, live site fetched 2026-08-22 |
| Bun gateway (homeops-gateway.fly.dev) | API v1, webhooks, JWT auth, SMS | Fly.io, iad (us-east), force_https, `/health` check | `services/gateway/`, `fly.toml`, `/health` live check OK 2026-08-22 |
| Supabase (project `qftesnsddnhumzmuelns`, ca-central-1) | Postgres + Auth + RLS; 13 tables | Supabase cloud | `supabase/migrations/*.sql` |
| Twilio | SMS send + status callbacks | Twilio | `services/gateway/src/lib/notify.ts`, `routes/webhooks.ts` |
| Property Meld webhook intake | Work-order intake funnel (MOCK mode until P4) | Fly.io (same gateway) | `routes/webhooks.ts`, `lib/property-meld/mock.ts` |
| Resend | Invite email | Resend | `lib/notify.ts` |
| Anthropic / OpenAI / Google Vision | Diagnostic model lookup (OCR etc.) | API-only | `lib/model-lookup.ts`, `.env.example` |

**Data inventory (PII-bearing tables):** `profiles` (name, phone, role, brokerage), `properties` (address), `passport_invites` (invited_email, token), `diagnostic_sessions` (symptom, summary — guest sessions have no user_id), `work_order_intake` (tenant_name, tenant_phone, title, description), `sms_message_status` (to_phone, from_number, error info). Public/non-PII: `receipt_keys`, `cpsc_recalls`, `corpus_*`, `model_registry`, `appliances`, `passports`, `passport_appliances`.

## 2. Methodology and honesty rules

- **Statuses:** `EXISTS` = implemented in code/migrations AND verifiable in this repo; `PARTIAL` = some coverage but incomplete or unverified; `MISSING` = not found anywhere; `N/A` = not applicable to a pre-revenue, cloud-only, solo-founder org (with rationale).
- **No fabricated controls.** Every `EXISTS` maps to a file path in section 3 of the evidence inventory (`02-control-evidence-inventory.md`). Anything not verifiable is marked `UNVERIFIED`, not claimed.
- Type I = point-in-time design review. This document assesses *design* of controls; operating effectiveness (Type II) is out of scope until the remediation roadmap completes.
- All policy documents referenced here are **drafts** in `03-policies/` and do not become claims until approved and dated.

## 3. Legend

- `EXISTS` — control present and evidenced in repo / live endpoints
- `PARTIAL` — partial coverage; gap described
- `MISSING` — not present; remediation in `05-remediation-roadmap.md`
- `N/A` — not applicable pre-revenue / cloud-only / solo founder

---

## 4. Common Criteria (CC1–CC9) — Security (mandatory)

### CC1 — Control Environment

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC1.1 | Commitment to integrity and ethical values | PARTIAL | The 10-Point Trust Constitution + banned-claims box (`docs/planning/homeops-app-development-document-v1.0.md` §1) are product-level integrity commitments. No formal code of conduct or security values statement exists — the Information Security Policy draft (`03-policies/`) fills the org-level gap. |
| CC1.2 | Board/independent oversight | N/A | Pre-revenue solo founder; no board. Documented in Information Security Policy §governance: founder acts as security owner until a board/advisors exist. |
| CC1.3 | Org structure, reporting lines, authorities | PARTIAL | Solo founder: single-owner model. Access Control Policy draft assigns roles (owner, gateway service role, consumers). No org chart beyond that. |
| CC1.4 | Commitment to competence | PARTIAL | No formal hiring/training program (no employees). Founder maintains skills; contractor onboarding not yet formalized. Access Control Policy covers access, not competence. |
| CC1.5 | Accountability | PARTIAL | Git history attributes changes; signed receipts attribute diagnostic dispositions. No formal role-based accountability policy yet (Access Control Policy draft). |

### CC2 — Communication and Information

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC2.1 | Internal communication of objectives/risks | PARTIAL | Architecture + development docs (`docs/planning/homeops-architecture-v1.0.md`, dev doc v1.0) capture objectives. No security incident communication procedure — Incident Response draft. |
| CC2.2 | External communication (commitments to customers) | MISSING | No published privacy policy or terms on the live site (checked 2026-08-22). No customer commitments documented. Required before revenue. |
| CC2.3 | Communication with governance | N/A | No board; folded into CC1.2. |

### CC3 — Risk Assessment

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC3.1 | Specifies objectives (incl. control objectives) | PARTIAL | Product objectives well-documented (dev doc); security objectives not yet written as measurable control objectives. This document set is the start. |
| CC3.2 | Identifies and analyzes risks | PARTIAL | No formal risk assessment existed before this task — `04-risk-register.md` is the first top-10 register. Needs annual refresh. |
| CC3.3 | Considers fraud risk | MISSING | SMS pump-fraud and webhook-abuse risks identified in risk register (R1, R3) but no formal fraud risk assessment. |
| CC3.4 | Identifies changes impacting controls | PARTIAL | Migration-driven schema changes and git history give traceability; no formal change-triggered risk review. CC8.1 gap applies. |

### CC4 — Monitoring Activities

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC4.1 | Ongoing and separate evaluations of controls | PARTIAL | 49 automated tests across 5 suites (webhooks, intake, receipt-signer, safety-kernel, public-intake) exercise key control logic. No continuous compliance monitoring; no scheduled control reviews. |
| CC4.2 | Evaluation and communication of deficiencies | MISSING | No defect/deficiency tracking process beyond git issues (none configured). |

### CC5 — Control Activities

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC5.1 | Risk-based control activities | PARTIAL | Controls exist ad hoc (auth, webhook signatures, receipt signing) and map well to risks; no documented control-activity selection process. |
| CC5.2 | General controls over technology | PARTIAL | JWT verification, RLS, CORS allowlist, Twilio HMAC validation are strong technology controls. Missing: rate limiting, security headers (CSP), dependency scanning. |
| CC5.3 | Policies that put controls into action | MISSING | No policies existed before this task. Six drafts now in `03-policies/`. Unapproved until reviewed. |

### CC6 — Logical and Physical Access

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC6.1 | Identification and authentication | EXISTS | Supabase Auth (magic link/OTP) + gateway JWT verification (`lib/jwt.ts`: ES256, JWKS, aud + exp checks). Guest intake tokens are the credential for `/p/<token>` (single-purpose, 72h TTL). |
| CC6.2 | Registers and authorizes new users | PARTIAL | `passport_invites` token flow + `custom_access_token_hook` (auth_profiles_hooks migration) provision consumers; role claim in JWT. No documented user provisioning procedure. |
| CC6.3 | Revokes access when appropriate | PARTIAL | Invites expire (410 on expired token); intake tokens expire at 72h. No documented account revocation process for founder/contractor accounts; no Supabase dashboard access reviews. |
| CC6.4 | Restricts physical access | N/A | Cloud-only, no office/facilities. Devices: founder laptop only (risk R7). |
| CC6.5 | Protects data/software from damage | PARTIAL | Secrets in env (`.env*` gitignored); no backups of the repo beyond git (remote not verified); Supabase daily backups are platform-provided (restore untested — A1.3 gap). |
| CC6.6 | Logical access security (firewalls, architecture) | PARTIAL | Supabase RLS on all 13 tables; CORS allowlist; `force_https` on Fly. CORS returns `c.req.url` (permissive) for disallowed origins instead of rejecting (finding F-04). No WAF/IP allowlisting on gateway. |
| CC6.7 | Restricts transmission/movement/removal of data | PARTIAL | No PII in URLs (intake links carry opaque tokens); TLS everywhere. No data-loss-prevention or export controls (consumer can export passport by design — Trust #6). |
| CC6.8 | Segregation of duties / incompatible functions | N/A | Solo founder — segregation is impossible and acknowledged as a compensating control: signed receipts + safety kernel provide deterministic, tamper-evident separation of decision from execution. Document in Access Control Policy. |

### CC7 — System Operations

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC7.1 | Detection and monitoring (security events, anomalies, vulnerabilities) | PARTIAL | Fly `/health` checks (30s interval) + auto-restart detect availability issues; Twilio status callbacks tracked. NO uptime/error alerting to the founder, no security-event monitoring, no vulnerability scanning. |
| CC7.2 | Evaluates and responds to security events (incident response) | MISSING | No incident response runbook or defined severity levels — Incident Response draft is the first pass. Twilio signature mismatch is logged but there is no alert path. |
| CC7.3 | Recovers from incidents | MISSING | No restore procedures tested; Supabase PITR capability unverified; no backup of the gateway source outside the single dev machine + git. |
| CC7.4 | Security operations program | MISSING | No dedicated security operations; no log collection/retention (console.log only, Fly logs ephemeral — finding F-06). |

### CC8 — Change Management

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC8.1 | Authorized, tested, approved changes | PARTIAL | Changes flow through git with descriptive commits; migrations are versioned and ordered. NO PR review process, no CI pipeline, no staging environment documented, no dependency pinning review (bun.lock/pnpm-lock committed — good). |

### CC9 — Risk Mitigation

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| CC9.1 | Mitigates business disruption risk | MISSING | No business continuity plan — Business Continuity draft is the first pass (bus-factor risk R5 is the standout). |
| CC9.2 | Manages vendor/business-partner risk | MISSING | Vercel/Fly/Supabase/Twilio/Resend in use; no vendor assessment or DPAs — Vendor Management draft. |

---

## 5. Availability (A1) — candidate in-scope

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| A1.1 | Maintains, monitors, evaluates current processing capacity | PARTIAL | Fly auto-scaling config present (`auto_stop/auto_start_machines`, min 0 → cold-start latency risk); no capacity planning or load testing; Vercel handles scale serverless. |
| A1.2 | Environmental protections, backups, recovery infrastructure | PARTIAL | Platform-provided: Supabase daily backups (assumed enabled — UNVERIFIED), Fly volume/redeploy, Vercel immutable deploys. No documented backup verification. |
| A1.3 | Tests recovery plan procedures | MISSING | No restore drill ever performed; no documented RTO/RPO; no runbook for redeploying gateway or restoring DB. |

**Availability commitments:** no SLA is offered to customers today (pre-revenue), so A1 criteria are assessed on *design* only; an uptime commitment should not be made until monitoring/alerting (R-13) and recovery testing (R-14) exist.

## 6. Confidentiality (C1) — candidate in-scope

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| C1.1 | Identifies and maintains confidential information | PARTIAL | Sensitive data classes are implicit (PII tables listed in §1; signing keys private). NO formal data classification scheme — Data Handling/Retention draft defines classes. |
| C1.2 | Disposes of confidential information | MISSING | No retention schedule enforced; `sms_message_status` is an immutable history with indefinite retention; intake PII has no deletion job; invite tokens not purged after claim. |

## 7. Processing Integrity (PI1–PI9) — candidate in-scope

| # | Criterion (abridged) | Status | Current state / gap |
|---|---|---|---|
| PI1.1–PI1.5 | Obtains/generates accurate, complete, timely info; authorized processing | PARTIAL | Signed diagnostic receipts (`receipt-signer.ts`: canonical JSON + manifest hash + Ed25519) give tamper-evident processing records (Trust #1/#8). No formal data-quality criteria documented. |
| PI2.1 | Policies over inputs/outputs for completeness/accuracy | PARTIAL | Webhook intake normalizes + classifies deterministically (`property-meld/intake.ts`, unit-tested 15 cases); input validation on JSON bodies; idempotent intake (unique index on work_order+event). |
| PI3.1 | Communicates processing integrity commitments | N/A | Pre-revenue; no customer commitments made. |
| PI4.1/PI4.2 | Complete, accurate input and output | PARTIAL | Validation at gateway; Twilio status callbacks folded back into rows; no automated output reconciliation. |
| PI5.1 | Identifies and addresses processing errors | PARTIAL | Errors return structured JSON; failed SMS folded to `failed` on invites; NO error alerting (same CC7 gap). |
| PI6.1 | Data processing objectives defined | MISSING | No documented processing objectives/expectations. |
| PI7.1 | Storage of inputs/outputs (retention for integrity) | MISSING | No retention policy — see C1.2. |
| PI8.1 | Protects data integrity | PARTIAL | RLS + app-level authorization; receipts signed; no DB-level integrity monitoring (e.g., no row-modification audit). |
| PI9.1 | Processing integrity procedures documented | MISSING | No documented processing procedures; code is the only spec. |

## 8. Supplementary Criteria (SE1–SE3)

**Honest note — do not treat as mapped criteria:** The SE series (TSP §100.08) is *supplementary*: the criteria apply only when the engagement explicitly incorporates them (e.g., SOC for Cybersecurity, SOC for Supply Chain engagements). A standard SOC 2 Type I report over Security + Availability + Confidentiality + Processing Integrity does **not** include SE1–SE3. The authoritative criterion text lives in the AICPA 2017 TSC document (free account download at aicpa-cima.com); the exact wording was NOT verified during this pass (gated download) and must be confirmed with the engagement auditor before any claim. Status is therefore uniformly:

| # | Status | Rationale |
|---|---|---|
| SE1 | N/A (out of scope) | Supplementary cybersecurity-program criteria; only invoked for specialized engagements. Not part of proposed Type I scope. |
| SE2 | N/A (out of scope) | Supplementary supply-chain criteria; only invoked for SOC for Supply Chain engagements. |
| SE3 | N/A (out of scope) | Supplementary criteria (specialized engagement types); confirm text with auditor if ever needed. |

If a future customer mandates SOC for Cybersecurity or Supply Chain, revisit this section with the AICPA document in hand.

## 9. Summary of posture

**What exists and is strong (evidence-backed):**
1. RLS on all 13 tables with least-privilege policies (service_role bypass only where the gateway needs it)
2. Gateway JWT verification (ES256, JWKS cache, aud/exp enforcement) + role middleware
3. Twilio callback HMAC-SHA1 signature validation with timing-safe compare
4. Signed diagnostic receipts (Ed25519 + key registry with public-key transparency)
5. Single-purpose, 72h-TTL, PII-free intake tokens with 410 expiry + idempotent intake
6. CORS allowlist, force_https, health checks
7. Consent gate before any analytics SDK (Trust #5)
8. Deterministic fail-closed safety kernel (17 tests)
9. 49 automated tests covering the security-critical seams

**Biggest gaps (by materiality):** no monitoring/alerting, no rate limiting on public endpoints, raw intake tokens at rest, mock-mode webhook accepts anything (until P4), no CI/SAST, no incident response or BC plan, no retention/deletion, no published privacy policy, single founder = bus factor.

**Category recommendation for first Type I:** Security (mandatory) + Availability + Confidentiality + Processing Integrity. Privacy (P-series) deferred (adds ~20 criteria); revisit when the privacy policy ships and tenant PII volume grows. Confirm scope with the auditor in the pre-engagement call.

*This document is a draft. Every line marked EXISTS is verifiable in the repo paths cited in 02-control-evidence-inventory.md. Nothing here is an audit claim.*
