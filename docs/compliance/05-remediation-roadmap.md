# HomeOps — SOC 2 Remediation Roadmap

**Status:** DRAFT — prioritized gap closure for the SOC 2 Type I readiness program
**Date:** 2026-08-22 · **Owner:** founder (Security Owner)
**Basis:** gaps from `01-tsc-gap-analysis.md`, findings F-01…F-10 from `02-control-evidence-inventory.md`, risks R1…R10 from `04-risk-register.md`

**Tags:** 🟢 **Ready-now** = cheap, do before revenue · 🟡 **After-revenue** = once there is paying traffic/partners · 🔵 **After-pilot** = pre-audit / audit

**Effort:** S = ≤1 day · M = 2–5 days · L = 1–3 weeks · XL = multi-week program

---

## 🟢 Ready-now (0 → first revenue)

| ID | Remediation | TSC gap | Effort | Notes / how |
|---|---|---|---|---|
| R-01 | **Rate limiting on public endpoints** (`/webhooks/*`, `/intake/public/:token`, `/invites/claim`) | CC7.1, CC6.6 (R1, R3) | S | Hono middleware (per-IP + per-token bucket). Reject > N req/min with 429. Test in gateway suite. |
| R-02 | **Hash intake tokens at rest** — store `sha256(token)` in `work_order_intake.token_hash`, return raw token once in the webhook response; keep 72h TTL | CC6.6 (R4) | S | Migration + lookup change in `/intake/public/:token` (hash the incoming token before query). Backfill: rotate existing tokens. |
| R-03 | **Fail closed on missing Twilio auth token** — if `TWILIO_AUTH_TOKEN` unset, reject status callbacks (500/503 + alert), never silently accept (today: warn + accept) | CC7.2, CC6.6 (F-03) | S | One-line branch flip + test. |
| R-04 | **CORS strict rejection** — return undefined (block) for disallowed origins instead of `c.req.url` | CC6.6 (F-04) | S | Confirm the PWA doesn't rely on the permissive branch, then flip. |
| R-05 | **Bus-factor mitigation** — sealed emergency envelope: password-manager master key, recovery codes, one-page recovery runbook; **name a successor** (founder decision) | CC9.1 (R5) | S | BC policy §3.2 spells out contents. Decision needed from founder. |
| R-06 | **Structured JSON logging + log archival** — replace console.log with structured logger; ship Fly logs to a cheap bucket (e.g., S3-compatible / Fly log shipper) with 90-day retention | CC7.4, CC4.1 (F-06) | M | No PII in logs (audit a grep for phone numbers). |
| R-07 | **Retention schedule + purge jobs** — implement the Data Handling/Retention §4 schedule: purge `sms_message_status` (90d), intake PII (12mo), invites (6mo); add consumer deletion endpoint or documented manual process | C1.2, PI7.1 (R10) | M | Scheduled gateway job (cron) + migration for soft-delete flags. |
| R-08 | **MFA + admin hygiene** — enable/verify MFA on Supabase, Vercel, Fly, Twilio; single admin account; screenshot for evidence | CC6.1, CC6.3 | S | Confirm in each console; record in evidence inventory. |
| R-09 | **Dependency scanning in minimal CI** — `pnpm audit` / `bun audit` / OSV-scanner on the monorepo, gating deploys on new criticals | CC8.1 (R6) | S–M | No CI exists; start with a single GitHub Action running audit + type-check + the gateway test suite. |
| R-10 | **Asset inventory + data classification doc** — formalize the table in Data Handling/Retention §2; map every env var/secret to its owner | CC6.5, C1.1 | S | This folder already contains the raw material. |
| R-11 | **Security headers on the PWA** — CSP, X-Frame-Options, HSTS via `next.config.ts` headers() | CC6.6 | S | Verify against the live site afterward. |
| R-12 | **Incident response dry-run** — walk the IR runbook once with a fake SEV-2; fix what breaks | CC7.2–7.4 | S | Practice beats prose. |
| R-20 | **Publish privacy policy + terms on the live site** (legal review for SB 244 position) | C2.2, C1.2 (R10) | M | Draft from Data Handling/Retention §6; counsel review before publishing. |

## 🟡 After-revenue

| ID | Remediation | TSC gap | Effort | Notes |
|---|---|---|---|---|
| R-13 | **Monitoring + alerting** — uptime checks on gateway + site, error-rate alerts (Fly logs → alert), paging to founder (SMS/email) | CC7.1, A1.1 (F-09) | M | Pick one tool (e.g., Better Stack / UptimeRobot); keep it minimal. |
| R-14 | **Supabase restore drill + RPO verification** — confirm PITR/backup settings, restore to a scratch project, document elapsed time | A1.3, CC7.3 | S | Do once before revenue; repeat quarterly. This makes the RTO/RPO claims in BC policy real. |
| R-15 | **Vendor assessments + DPAs** — formalize vendor register (§2), obtain SOC 2/ISO reports from Supabase/Twilio/Resend, sign DPAs before real tenant data scales | CC9.2 | M | Vendor Management policy has the register template. |
| R-16 | **Penetration test / external review** — one engagement (or a respected bug-bounty-style review) of gateway + PWA | CC7.1 | M | Budget item; remediate findings, keep the report as evidence. |
| R-17 | **Secrets rotation automation + schedule** — rotate service key, Twilio token, receipt key (via `receipt_keys`), AI keys annually; automate where possible | CC6.5 | M | Vendor policy §5 has the cadence table. |
| R-18 | **Readiness review with a real auditor** — pre-engagement call; confirm scope (Security + A + C + PI), SE-series applicability, evidence list | All | S | Do this BEFORE making any public "SOC 2 ready" claim (risk R8). |

## 🔵 After-pilot (pre-audit / audit)

| ID | Remediation | TSC gap | Effort | Notes |
|---|---|---|---|---|
| R-19 | **Formal SOC 2 Type I audit** — engage a CPA firm, run the examination over Security + A + C + PI | All | XL | Timeline: ~4–8 weeks from readiness sign-off. |
| R-21 | **Type II transition planning** — define the 6–12 month observation window, monitoring evidence capture (CI logs, deploy logs, drill records) | CC4.1 | M | Start capturing evidence continuously once Type I ships. |

---

## Sequencing note

The Ready-now list is ordered by (risk score × effort): R-01/R-03/R-04 are single-afternoon changes that close the two highest-scoring abuse risks (R1, R3). R-05 needs a founder decision (successor). R-02/R-07 are the only ones touching the DB — batch them in one migration window. R-20 is a legal dependency, start the draft early.

**Definition of "roadmap done":** all 🟢 items shipped and verified (tests + live check), R-13/R-14/R-18 complete, and the gap analysis re-scored with no remaining `MISSING` on in-scope criteria — at which point R-19 (the Type I audit) is a scheduling exercise, not a surprise.
