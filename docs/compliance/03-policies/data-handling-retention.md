# HomeOps Data Handling & Retention Policy

**Version:** 0.1 (DRAFT — not yet approved)
**Owner:** HomeOps (solo founder)
**Last reviewed:** 2026-08-22 · **Review cadence:** quarterly

> DRAFT NOTICE: First draft for SOC 2 readiness. Approve and date before treating as a control.

## 1. Purpose

Define how HomeOps classifies, handles, and disposes of data — especially tenant PII — across the Year-1 stack.

## 2. Data classification

| Class | Definition | Examples | Handling baseline |
|---|---|---|---|
| **Public** | No access restriction | `receipt_keys` (public keys), `cpsc_recalls`, marketing site copy | Readable by anyone; integrity-protected |
| **Internal** | HomeOps business data, not customer PII | `corpus_documents/chunks`, `model_registry`, architecture docs | Authenticated read only; no external sharing |
| **Confidential** | Data whose disclosure harms HomeOps or users | Diagnostic receipts (signed), appliance/passport records, property addresses, service credentials | RLS-scoped access; service-role only server-side; signed for integrity |
| **Restricted (PII)** | Directly identifies a person | `profiles` (name, phone), `work_order_intake.tenant_name/tenant_phone`, `sms_message_status` (to_phone), `passport_invites.invited_email`, diagnostic session content | Least privilege (self / gateway-service-role); no PII in URLs or logs; retention schedule below |

## 3. Handling rules (applied in code today)

1. **No PII in URLs.** Intake links carry opaque tokens (`homeops:wo:<hash>.<random>`); tenant phone/name are never in the query string. Verified in `lib/property-meld/intake.ts` and the `/p/[token]` page.
2. **No PII in logs.** Log lines in the gateway are structured-error only; the one exception (mock SMS logging) logs to console in mock mode only and must not ship real numbers in live mode — re-verify before P4 go-live.
3. **PII-safe projections.** Public endpoints return only whitelisted fields (`/intake/public/:token` never returns tenant phone/name — verified `routes/public.ts`).
4. **Transit encryption.** TLS everywhere (Vercel + Fly `force_https`).
5. **At-rest protection.** RLS on all 13 tables; tenant phone columns are only readable via scoped policies; service role is the only bypass and lives in the gateway env.

## 4. Retention schedule (draft — needs implementation)

| Data | Draft retention | Disposal method | Status |
|---|---|---|---|
| `sms_message_status` (callbacks) | 90 days, then purge | DELETE job (gateway/scheduled) | **MISSING — no job exists; indefinite today** |
| `work_order_intake` (incl. tenant PII) | 12 months after work-order closed, or 72h after token expiry for rows never opened | Soft-delete flag then purge; keep aggregate stats only | **MISSING — no job exists** |
| `diagnostic_sessions` (guest) | 12 months; linked to intake lifecycle | Purge with intake | **MISSING** |
| `passport_invites` | 6 months after activation/expiry | DELETE | **MISSING** |
| `receipt_keys` | Retain active; revoke (not delete) on rotation; keep revoked for verification of old receipts | `revoked_at` set; rows retained | EXISTS (policy + schema) |
| Signed receipts (evidence chain) | Retain for the life of the passport + 2 years | Keep (they are the trust record) | EXISTS by design |
| Build/CI logs, Fly logs | Platform defaults; treat as ephemeral | — | UNVERIFIED |
| Supabase backups | Platform daily/PITR | — | UNVERIFIED (dashboard) |

**Founder decision needed:** adopt the draft schedule above (recommended) or modify per business need. Until a purge job exists, retention is *de facto* indefinite — that is a C1.2/CC7 gap tracked as remediation R-07.

## 5. Disposal & deletion requests

- **Consumer data export (Trust #6):** users can export their passport/diagnostic ledger in open format — supported by design.
- **Deletion requests:** no self-service deletion endpoint exists. For now: manual deletion via Supabase dashboard by the founder, logged in the issue tracker. A gateway deletion endpoint is a candidate after-revenue item (R-07 scope).
- **Media/device disposal:** cloud-only; the only physical asset is the founder's laptop. Before disposal: full-disk encryption confirmed, key material (`~/.hermes/homeops-receipt-signing.key`) securely deleted.

## 6. Privacy commitments (product-level)

The 10-Point Trust Constitution (dev doc v1.0 §1) already commits HomeOps to: on-device data sovereignty where feasible, no forced action, free export, and disclosed referral compensation. The analytics consent gate (`apps/web/lib/consent.ts`) ensures no SDK initializes before consent — this is the operational proof of Trust #5 and is the strongest privacy control in the stack today.

**Gap:** no published privacy policy / terms on the live site (verified 2026-08-22). This is both a C2.2 gap and a legal exposure (California SB 244 context for the trades vertical) — remediation R-20, Ready-now.

## 7. Related documents

Information Security Policy · Access Control Policy · Incident Response · `01-tsc-gap-analysis.md` (C1.2, PI7.1) · `05-remediation-roadmap.md` (R-07)
