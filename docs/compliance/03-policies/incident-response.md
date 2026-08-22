# HomeOps Incident Response Policy

**Version:** 0.1 (DRAFT — not yet approved)
**Owner:** HomeOps (solo founder) — the founder is the on-call responder 24/7
**Last reviewed:** 2026-08-22 · **Review cadence:** after every incident + quarterly

> DRAFT NOTICE: First draft for SOC 2 readiness. Approve and date before treating as a control. **Practice this runbook before you need it** (remediation R-12).

## 1. Purpose

Define how HomeOps detects, contains, eradicates, and recovers from security incidents, and how it communicates about them — honestly, without overclaiming.

## 2. What counts as an incident

| Severity | Definition | Examples |
|---|---|---|
| **SEV-1 Critical** | Confirmed unauthorized access to tenant PII, or loss of the signing key / service-role key, or full service outage > 30 min | DB dump via leaked service key; receipt key compromise; gateway down for tenants |
| **SEV-2 High** | Suspected compromise, active abuse, or confirmed integrity break with limited blast radius | Webhook spam/abuse; forged SMS; receipt signature failures in production |
| **SEV-3 Medium** | Security-relevant anomaly, no confirmed impact | Twilio signature mismatch in logs; unexpected 401/403 spikes; failed health checks |
| **SEV-4 Low** | Policy/process violation, no system impact | RLS disabled in a migration; PII in a log line; env var drift (F-07) |

## 3. Detection sources (what exists today — thin)

- Fly `/health` checks (availability only) — verified live
- Twilio status callbacks (delivery failures) — in `sms_message_status`
- Gateway error logs (console; **ephemeral** — Fly logs are not archived; finding F-06)
- Manual review of Supabase dashboard + git history

**Gap acknowledged:** no uptime/error alerting, no intrusion detection, no log retention. Until R-13 lands, detection is *reactive and human* — the founder checks dashboards and the kanban board. This is documented as a design limitation, not hidden.

## 4. Response procedure

### 4.1 Contain (immediate)
1. **Classify** severity (table above). SEV-1/2 → treat as active.
2. **Contain the blast radius:**
   - Suspected key compromise → rotate immediately (Supabase keys, Twilio auth token, receipt key via `receipt_keys.revoked_at` + new key, Fly/Vercel env).
   - Service abuse → block at the gateway (deploy a deny rule / rate limit) or, if needed, stop the affected service.
   - Data exposure → note exactly what was exposed, to whom, and for how long (timeline discipline).
3. **Do not destroy evidence** before capturing it (logs, payloads, timestamps).

### 4.2 Eradicate & recover
4. Fix root cause (revert deploy, patch, purge compromised tokens).
5. Restore from known-good state: git commit → redeploy (Vercel/Fly); DB → Supabase PITR (drill required first — R-14).
6. Re-verify `/health` + a smoke test of the tenant flow (webhook → SMS → link → diagnostic).

### 4.3 Communicate
7. **Internal:** log the incident as a kanban card with severity, timeline, root cause, actions.
8. **External (if tenant PII involved):** assess notification obligations (contractual, regulatory — e.g., CA breach-notification law applicable to CA tenants). When in doubt, notify affected users plainly and offer a factual account — no legal disclaimers improvised; consult counsel (founder decision).
9. **No banned claims:** never say "nothing to worry about, our systems are unhackable." Say what is *known*.

### 4.4 Post-incident
10. Root-cause review within 5 business days: what failed, what control would have prevented it, remediation task created (with owner + due date), this policy updated if the runbook failed.
11. Track recurring themes in the risk register (e.g., repeated webhook abuse → rate limiting becomes priority).

## 5. Key contacts & access

- Founder: primary responder (phone/SMS + dashboard access from the laptop).
- Vendors to contact for incidents: Supabase (support), Fly.io (support), Twilio (abuse: abuse@twilio.com), Vercel (support).
- Legal: none retained — founder approves external communications; engage counsel for any notification decision.

## 6. Communication guidelines (external)

- Acknowledge within 24h of confirmed SEV-1/2 where user impact or PII is involved.
- Provide: what happened (facts), what data was involved, what we've done, what the user should do.
- Update the affected users as facts change. No "we're investigating" placeholder for weeks — set a next-update time.

## 7. Related documents

Information Security Policy · Data Handling/Retention (notification + disposal) · Business Continuity (outage vs. incident) · `05-remediation-roadmap.md` (R-12 runbook test, R-13 alerting, R-14 restore drill)
