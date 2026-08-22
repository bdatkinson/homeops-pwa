# HomeOps — Risk Register (Top 10)

**Status:** DRAFT / UNVERIFIED — first formal register, 2026-08-22
**Owner:** HomeOps (solo founder) · **Review cadence:** quarterly (re-score + add/retire)

**Scoring:** Likelihood × Impact (Low/Medium/High) → Risk = L×I with a 1–9 scale (1=L·L, 9=H·H). Pre-revenue context: revenue loss is scored as *trust + partner-loss* impact, not direct revenue.

| # | Risk | Category | Likelihood | Impact | Score | Owner | Mitigation / controls (existing + planned) |
|---|---|---|---|---|---|---|---|
| R1 | **Webhook abuse / SMS pump fraud** — public endpoints (`/webhooks/property-meld`, `/intake/public/:token`, `/invites/claim`) have no rate limiting; mock webhook accepts any payload | Abuse | Medium | High | 6 | Founder | **Existing:** token TTL 72h, idempotent intake, mock simulator 404 in live mode. **Planned:** R-01 rate limiting; R-03 fail-closed Twilio; live HMAC for Property Meld (P4, F-02). |
| R2 | **Service-role key leak** — Supabase service key in gateway env; a leak = full DB access incl. tenant PII | Data breach | Low | High | 4 | Founder | **Existing:** secrets in env, `.env*` gitignored, key never in browser code. **Planned:** R-17 rotation schedule; R-18 pen test; secrets inventory in vendor policy §5. |
| R3 | **SMS phishing via forged intake** — until P4, Property Meld webhook has no signature validation (mock `verifySignature` = true); an attacker who can reach the endpoint can trigger tenant SMS with arbitrary content | Fraud/abuse | Medium | High | 6 | Founder | **Existing:** live mode flips to HMAC; simulator disabled in live. **Planned:** R-01 rate limit + allowlist; verify HMAC scheme at P4 cutover (F-02). |
| R4 | **Intake token leakage/replay** — tokens stored raw in DB (`work_order_intake.token`), single-purpose but not single-use; a token in an SMS relay/log can be replayed within 72h | Data exposure | Medium | Medium | 4 | Founder | **Existing:** 72h TTL, 410 on expiry, no PII in URL. **Planned:** R-02 store hash of token, return raw once; single-use consumption on diagnostic start. |
| R5 | **Bus factor / founder unavailability** — no documented successor, keys/knowledge in one head + one laptop; founder down = business down | Continuity | High | High | 9 | Founder | **Existing:** signed receipts + migration log preserve audit trail; git remote. **Planned:** R-05 emergency envelope + named successor; BC policy §3.2; R-12 runbook drills. |
| R6 | **Supply-chain compromise** — Next.js/Hono/Bun/Supabase deps; no dependency scanning, no CI gate | Supply chain | Low | High | 4 | Founder | **Existing:** lockfiles committed (bun.lock, pnpm-lock.yaml), frozen installs on deploy. **Planned:** R-09 `pnpm audit`/OSV in CI; R-18 pen test. |
| R7 | **Developer-machine compromise** — dev key (`~/.hermes/homeops-receipt-signing.key`), dashboards, git remote all on one laptop; ransomware/compromise = key + repo exposure | Endpoint | Medium | High | 6 | Founder | **Existing:** single-user machine, secrets not in repo. **Planned:** R-17 key rotation + encrypted backup of key material; disk encryption verification; MFA everywhere (R-08). |
| R8 | **Overclaiming / compliance failure** — marketing or audit-prep claims that outrun evidence (banned-claims box; "SOC 2 ready" before it's true) | Reputation/legal | Medium | Medium | 4 | Founder | **Existing:** banned-claims box in dev doc; all compliance docs marked DRAFT/UNVERIFIED. **Planned:** pre-audit readiness review with a real auditor (R-18) before any public claim. |
| R9 | **Provider outage with no documented recovery** — Vercel/Fly/Supabase single-region-ish dependency; no restore drill, no runbook | Availability | Medium | Medium | 4 | Founder | **Existing:** Fly health checks + auto-restart, immutable deploys. **Planned:** R-13 monitoring/alerting; R-14 restore drill; BC policy §3.1. |
| R10 | **Privacy/regulatory exposure** — tenant PII (phone, name, address) collected with no published privacy policy/terms; California SB 244 / breach-notification exposure for the trades vertical | Legal | Medium | High | 6 | Founder | **Existing:** consent gate for analytics; PII-safe projections; Trust Constitution. **Planned:** R-20 publish privacy policy + terms (Ready-now); R-07 retention/deletion; legal review of SB 244 position. |

## Watch list (tracked, not top-10)

- W1. Twilio STOP/opt-out handling correctness (compliance with carrier rules) — verify current behavior pre-revenue.
- W2. Property Meld sandbox cutover (P4) — new attack surface; re-run R1/R3 scoring at cutover.
- W3. AI-vendor prompt data: ensure diagnostic text sent to Anthropic/OpenAI/Google never includes tenant PII by construction.
- W4. Receipt key rotation — no automated rotation yet; manual annual (vendor policy §5).

## Top 3 to act on first (cross-ref roadmap)

1. **R5** (bus factor) — 9/9: emergency envelope + successor decision is the highest-leverage action.
2. **R1 + R3** (webhook abuse/fraud) — 6/6 each: rate limiting + fail-closed signature handling are cheap and Ready-now.
3. **R10** (privacy exposure) — 6/6: publish privacy policy/terms; it is also a C2.2 gap in the TSC analysis.

*Draft register. Re-score quarterly; every material change (P4 go-live, first revenue, new vendor) triggers a re-score.*
