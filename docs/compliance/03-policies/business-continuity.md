# HomeOps Business Continuity Policy

**Version:** 0.1 (DRAFT — not yet approved)
**Owner:** HomeOps (solo founder)
**Last reviewed:** 2026-08-22 · **Review cadence:** quarterly + after any recovery drill

> DRAFT NOTICE: First draft for SOC 2 readiness. Approve and date before treating as a control. **The single biggest continuity risk is the founder (bus factor R5), not the cloud.** This policy is written around that fact.

## 1. Purpose

Define how HomeOps keeps the tenant diagnostic funnel available and recoverable across outages and disruptions, and how a solo founder structures recovery so the business can survive without them in the short term.

## 2. Business impact analysis (Year-1, pre-revenue)

| Function | System | Max tolerable downtime (draft) | Notes |
|---|---|---|---|
| Tenant diagnostic landing (`/p/<token>`) | Vercel + gateway + Supabase | 4 h (pre-revenue; no SLA) | The core funnel — outage = lost trust with PM partners |
| SMS delivery + status | Twilio + gateway | 4 h | Twilio is externally redundant; gateway is the single point |
| Webhook intake (Property Meld) | Gateway | 24 h pre-P4 (mock anyway); **2 h post-P4** | Live intake outage = missed work orders |
| Passport view/activation | Vercel + gateway | 8 h | |
| Admin access (founder) | Laptop + dashboards | 24 h (until replacement hardware) | |

**RTO/RPO (draft):** RTO 4h for the tenant funnel; RPO 15 min (Supabase PITR / continuous backup — verify platform setting; restore drill required before this is a claim — R-14).

## 3. Continuity strategies by failure scenario

### 3.1 Cloud provider outage (Vercel / Fly / Supabase)
- **Vercel down:** site is static-renderable; last-good deploy remains serving (immutable deploys). If the platform is fully down, tenants still get SMS → but the link resolves to nothing — communicate via Twilio broadcast to affected PMs.
- **Fly down:** gateway unavailable → webhooks fail (500s), intake unprocessed, no SMS. Recovery: redeploy from git (`fly deploy` on a working region) — needs founder access; documented in runbook. Consider `min_machines=1` for the funnel when live intake matters (today it's 0 → cold starts).
- **Supabase down:** full product unavailable (DB is the system of record). Recovery: platform-side; wait out or PITR restore. No on-prem fallback exists — **documented acceptance**, pre-revenue.

### 3.2 Founder unavailable (the real risk)
- **Key knowledge** (deploy commands, dashboard logins, secret locations) must be recoverable by a trusted person in an emergency. Draft mitigation: a sealed emergency envelope (password manager master key + recovery codes + one-page runbook) with a named successor (e.g., co-founder/partner or a vetted contractor).
- **Not yet implemented — tracked as R-05 (bus factor) in the risk register. Founder decision needed on the named successor.**

### 3.3 Data loss / corruption
- Supabase: PITR/daily backups (platform — verify enabled). Restore procedure must be **drilled once before revenue** (R-14).
- Receipt keys: if the signing key is lost, old receipts become unverifiable against `key_id` — keep an encrypted backup of the key material (password manager or sealed envelope), because rotation does not restore the ability to sign in the old identity.

### 3.4 Security incident with service impact
- Continuity activities during an incident are governed by the Incident Response policy (contain → recover → communicate). Outage-from-incident uses the same recovery paths as §3.1.

## 4. Recovery runbook (draft — to be drilled)

| Step | Action | Tooling |
|---|---|---|
| 1 | Confirm scope: Vercel / Fly / Supabase / Twilio / laptop | Status pages + `/health` check |
| 2 | Gateway redeploy from last known-good commit | `git log` → `fly deploy` |
| 3 | DB restore if corruption | Supabase dashboard PITR (drill first) |
| 4 | Verify funnel end-to-end | Webhook simulate (mock) → SMS → link → diagnostic |
| 5 | Communicate to PM partners if > 2h | Twilio broadcast / email |
| 6 | Post-mortem kanban card + policy update | Kanban board |

## 5. Drills and testing (commitment)

- **Quarterly:** gateway redeploy drill (region failover / fresh deploy from git) — 30 min.
- **Before first revenue:** one full Supabase restore drill (R-14).
- **After every drill:** update this policy with what failed.

## 6. Related documents

Incident Response (incidents vs. outages) · Information Security Policy · `01-tsc-gap-analysis.md` (A1.2/A1.3, CC9.1) · `04-risk-register.md` (R5 bus factor, R9 provider outage) · `05-remediation-roadmap.md` (R-12 runbook, R-13 monitoring, R-14 restore drill)
