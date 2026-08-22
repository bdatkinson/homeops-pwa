# HomeOps Information Security Policy

**Version:** 0.1 (DRAFT — not yet approved)
**Owner:** HomeOps (solo founder)
**Last reviewed:** 2026-08-22 · **Review cadence:** quarterly, or after any material change (new vendor, new data class, incident)

> DRAFT NOTICE: This is a first draft for the SOC 2 readiness program. It becomes a control only after the founder reviews, approves, and dates it. Until then it records intent, not claim.

## 1. Purpose

Define how HomeOps protects the confidentiality, integrity, and availability of customer and tenant data across the Year-1 stack: the Next.js PWA (Vercel), the Bun gateway (Fly.io), Supabase (project `qftesnsddnhumzmuelns`, ca-central-1), Twilio, Resend, and Property Meld (mock until P4).

## 2. Scope

All systems, data, and people that touch HomeOps production: the founder, any future contractor, and every service account (Supabase service role, Twilio, Resend, Anthropic/OpenAI/Google Vision API keys, receipt signing key).

## 3. Governance

- **Security Owner:** the founder. Sole accountable person pre-revenue. The founder owns: risk register review (quarterly), policy review, incident response activation, and vendor onboarding approval.
- **No board exists** — CC1.2 is acknowledged as N/A until advisors/investors exist; the founder acts as the governance layer and this policy is the written record of that decision.
- **Evidence discipline (banned claims):** HomeOps never claims "zero-knowledge," "immutable," or "error-free." The Trust Constitution's banned-claims box governs marketing language; this policy extends it to security claims — we state what is *verified*, and mark the rest draft/unverified (see `docs/compliance/02-control-evidence-inventory.md`).

## 4. Policy statements

### 4.1 Risk management
1. A top-10 risk register is maintained (`docs/compliance/04-risk-register.md`) and reviewed quarterly.
2. New data classes, vendors, or external endpoints trigger a risk review before go-live.
3. No new service may hold tenant PII without a documented owner and retention answer (see Data Handling/Retention).

### 4.2 Access
1. Access is granted on least-privilege and revoked on offboarding (see Access Control Policy).
2. Service-role keys (Supabase) are used only by the gateway, never in browser code. The web app uses the anon key + RLS.
3. All human access to admin consoles (Supabase, Vercel, Fly, Twilio) requires MFA where the platform supports it.

### 4.3 Data protection
1. All tables enforce RLS (all 13, per evidence inventory §5). No new table ships without RLS policies.
2. PII is never placed in URLs or logs; intake links carry opaque single-purpose tokens (72h TTL).
3. Secrets live in platform env stores (Fly secrets, Vercel env, Supabase secrets), never in git (`.env*` is ignored).
4. Tenant phone numbers are the most sensitive field in the system today; access is gateway-service-role only, and `sms_message_status` history is treated as sensitive by default.

### 4.4 Operations & change
1. All production changes flow through git with descriptive commits; migrations are versioned and ordered.
2. The safety kernel (deterministic, fail-closed) is the authority for what a consumer may do physically — no language model authorizes action. Changes to `safety-kernel.ts` require the 17-test suite to pass.
3. Health checks (`/health`, Fly 30s) must pass after every gateway deploy; a broken health check means rollback.

### 4.5 Incident response
1. Suspected incidents are handled per Incident Response policy; the founder is the on-call responder 24/7.
2. Any confirmed breach involving tenant PII triggers: containment, notification assessment (regulatory/contractual), and a root-cause review logged as a kanban task.

### 4.6 Vendors
1. Vendors handling PII (currently Supabase, Twilio, Resend; Vercel/Fly host but handle limited PII) are assessed at onboarding and annually (see Vendor Management policy).
2. DPAs are required from vendors storing tenant PII before we put real tenant data with them at scale.

## 5. Compliance and enforcement

Non-compliance (e.g., a commit that disables RLS, a key pasted into code, PII added to a log line) is treated as a security event: fix immediately, log the root cause, and review the relevant policy. With a solo founder there is no disciplinary ladder — the control is the audit trail (git history, receipts, migration log) plus this policy.

## 6. Related documents

- Access Control Policy · Data Handling/Retention · Incident Response · Vendor Management · Business Continuity (`docs/compliance/03-policies/`)
- Control evidence inventory (`docs/compliance/02-control-evidence-inventory.md`)
- Risk register (`docs/compliance/04-risk-register.md`)
- Remediation roadmap (`docs/compliance/05-remediation-roadmap.md`)
