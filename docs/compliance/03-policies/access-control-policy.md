# HomeOps Access Control Policy

**Version:** 0.1 (DRAFT — not yet approved)
**Owner:** HomeOps (solo founder)
**Last reviewed:** 2026-08-22 · **Review cadence:** quarterly + after any role change

> DRAFT NOTICE: First draft for SOC 2 readiness. Approve and date before treating as a control.

## 1. Purpose

Define who can access what, how access is granted and revoked, and how authentication is enforced across HomeOps systems.

## 2. Roles (current)

| Role | Who | Access granted |
|---|---|---|
| Owner / Security Owner | Founder | All admin consoles (Supabase, Vercel, Fly, Twilio, Resend), gateway env/secrets, GitHub repo, receipt signing key |
| Contractor (future) | N/A today | Scoped per engagement: repo read or feature-branch, staging only; no production secrets without written approval |
| Gateway service role | Machine (Fly) | Supabase `service_role` — the only holder of service-role key; used server-side only |
| Web app (anon) | Machine (Vercel) | Supabase anon key + RLS-scoped queries; PostHog only after consent |
| Consumer / broker_pm | End users | Supabase Auth sessions; role claim from `custom_access_token_hook`; gateway JWT for API |
| Guest (intake token) | Tenant with SMS link | Single-purpose 72h token; the token IS the credential for `/p/<token>`; no account created |

## 3. Authentication requirements

1. **End users:** Supabase Auth (email OTP / magic link). Sessions carry ES256 JWTs; the gateway verifies signature via JWKS, `aud=authenticated`, and expiry (`lib/jwt.ts`) before trusting any claim.
2. **Role enforcement:** `requireAuth` + `requireRole` middleware; role resolved from the JWT claim (fast path) or the profiles table (fallback). Fail-safe default: consumer.
3. **Guests:** intake tokens are 18-byte random + work-order scope hash, 72h TTL, single-purpose, PII-free. Expired tokens return 410.
4. **Humans (admin consoles):** MFA must be enabled on Supabase, Vercel, Fly, Twilio, and any future admin surface. (UNVERIFIED — to be confirmed in each console and screenshotted for evidence.)
5. **Services:** gateway authenticates to Supabase with service role; Twilio/Resend with API keys from env; no hardcoded credentials anywhere in the repo (`.env*` gitignored).

## 4. Provisioning and deprovisioning

- **Grant:** new human access requires the founder's approval; the founder performs the grant and logs it (this policy file's change history).
- **Revoke:** on any offboarding or suspected compromise, revoke immediately: rotate keys, remove dashboard members, revoke GitHub access, expire outstanding tokens. For guests, token expiry is automatic (72h) — no manual revocation needed for the normal path.
- **Access reviews:** quarterly, the founder reviews: dashboard members across Supabase/Vercel/Fly, API key inventory, and the receipt-keys registry (`receipt_keys.active` flags) for anything that should be revoked.

## 5. Segregation of duties (compensating control)

Solo founder — separation of duties is structurally impossible. HomeOps compensates with *technical* controls that create an auditable separation between decision and execution:

- The **safety kernel** is deterministic and fail-closed: no LM output can authorize a physical action.
- **Signed diagnostic receipts** (Ed25519) bind every disposition to a tamper-evident record verifiable by any downstream party via the public key registry.
- **Signed commits + migration log** give a non-repudiation trail for changes.

This is the documented rationale for CC6.8 (N/A-with-compensating-controls) in the gap analysis.

## 6. Remote access and devices

- Production work happens from the founder's machine (Linux, single user). The machine holds the dev receipt key (`~/.hermes/homeops-receipt-signing.key`) — treat as sensitive (risk R7).
- No production console access from untrusted/shared devices.
- If a contractor joins, they get staging-only access until a written exception is approved.

## 7. Related documents

Information Security Policy (governance) · Data Handling/Retention (what each class may do with data) · Incident Response (what to do when access is abused)
