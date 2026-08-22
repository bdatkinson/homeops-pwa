# HomeOps Compliance — README

**Folder:** `docs/compliance/` in the homeops-pwa monorepo
**Created:** 2026-08-22 (task COMP-01) · **Status of everything here: DRAFT / UNVERIFIED**

## What this folder is

The compliance program's working directory: SOC 2 (Type I) readiness artifacts for the Year-1 stack (Next.js PWA on Vercel, Bun gateway on Fly.io, Supabase `qftesnsddnhumzmuelns` ca-central-1, Twilio, Resend, Property Meld mock). It answers three questions for anyone (founder, future auditor, future employee):

1. **Where are we?** — `01-tsc-gap-analysis.md` maps every Trust Services Criterion to the actual codebase state, honestly.
2. **What do we already have?** — `02-control-evidence-inventory.md` lists existing controls with file-path evidence.
3. **What's the plan?** — `04-risk-register.md` (top 10 risks) + `05-remediation-roadmap.md` (prioritized closure, tagged Ready-now / After-revenue / After-pilot).

## Layout

```
docs/compliance/
  README.md                          <- this file
  01-tsc-gap-analysis.md             TSC gap analysis (CC1-CC9, A1, C1, PI1-PI9, SE1-SE3)
  02-control-evidence-inventory.md   existing controls -> evidence paths + RLS matrix + findings F-01..F-10
  03-policies/                       six policy drafts (v0.1, unapproved)
    information-security-policy.md
    access-control-policy.md
    data-handling-retention.md
    incident-response.md
    vendor-management.md
    business-continuity.md
  04-risk-register.md                top 10 risks (L×I scores, owners, mitigations)
  05-remediation-roadmap.md          prioritized gaps R-01..R-21 with effort + phase tags
```

## Ground rules (read before editing)

1. **No fabricated controls.** Every "EXISTS" claim must trace to a file path or a live check (see evidence inventory). If you can't verify it, mark it UNVERIFIED — do not delete the uncertainty.
2. **Everything is DRAFT until approved.** Policies become controls only when the founder reviews, approves, and dates them. Never point a customer or auditor at an unapproved policy as if it were in force.
3. **No banned claims.** The Trust Constitution's banned-claims box applies here too: no "zero-knowledge," "immutable," "error-free," "SOC 2 compliant" — use "tamper-evident," "signed," "draft readiness."
4. **The codebase is the source of truth, not this folder.** If a migration or gateway file changes a control (e.g., RLS policy, signature handling), update the evidence inventory in the same commit.
5. **Findings live in two places:** F-IDs (F-01…) are defined in `02-control-evidence-inventory.md` §9; they are resolved only when the remediation (R-XX) ships and the finding is struck through.

## How this folder updates

| Trigger | What to do |
|---|---|
| New table / migration | Add to RLS matrix in evidence inventory; re-check gap analysis CC6.6 |
| New vendor or endpoint | Update vendor register (03-policies/vendor-management.md §2) + risk register if PII involved |
| Control remediation ships (R-XX) | Mark done in `05-remediation-roadmap.md`, strike the F-ID, note evidence path |
| Quarterly review (founder) | Re-score `04-risk-register.md`, confirm policy review dates, check MFA/backups (evidence inventory) |
| Pre-audit | Re-verify every row in the evidence inventory; pull fresh artifacts; confirm scope with the auditor (R-18) |

## Related (outside this folder)

- Product trust commitments: `docs/planning/homeops-app-development-document-v1.0.md` (10-Point Trust Constitution, banned-claims box)
- Architecture: `docs/planning/homeops-architecture-v1.0.md`
- Live stack evidence: gateway `/health`, www.homeops.biz (verified 2026-08-22)
- Obsidian mirror: `~/obsidian-vault/02-outputs/homeops-soc2-compliance-readiness-2026-08-22.md` (summary only — this folder is canonical)

## Open decisions needing the founder

1. R-05: name a successor / build the emergency envelope (bus factor, risk score 9/9).
2. R-07: adopt the draft retention schedule (90d sms status / 12mo intake / 6mo invites) or modify.
3. R-18: pick a CPA/auditor for the pre-engagement scope call.
4. R-20: legal review of the privacy policy draft + SB 244 position.
