# HomeOps PWA

**Before you call. Before you pay. Before you make it worse.**

HomeOps is the Year 1 HomeOps product: an SMS zero-install PWA that turns a
tenant's appliance issue into a safe triage flow — deflecting what can be
fixed (Level 1) and handing a pre-diagnosed, single-visit dispatch to a pro
for what can't. Seeds a permanent Appliance Passport as the Move-In Bridge.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- Tailwind CSS 4 (PostCSS)
- Deploys to Vercel
- Talks to the HomeOps gateway (Fly.io) — invite claim + public passport endpoints

## Year 1 boundary

This is the **SMS zero-install PWA + PM dashboard** surface. Native iOS/Android
is Year 2. The broker-first React Native direction and PRD v1.0 are archived —
do not build to them.

Product spine: `homeops-pwa-product-spine-v1.0.md` (A1–E5 shared spine,
10-Point Trust Constitution, banned-claims box). Canonical build doc:
`homeops-app-development-document-v1.0.md` (in the vault, 02-outputs).

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing (calm authority, one-tap) |
| `/activate/[token]` | SMS invite claim → gateway `/api/v1/invites/claim` |
| `/p/[token]` | Public Appliance Passport → gateway `/api/v1/passports/public/[token]` |
| `/dashboard` | PM dashboard (WIP) |

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Deploy

Vercel. `vercel.json` pins the build command and Next.js framework.

## Repo history note

Extracted from the `homeops-app` monorepo (2026-08-20) as the standalone
Year 1 PWA. The monorepo's RN/Expo mobile app, gateway, and corpus packages
are out of scope here. If a future build needs `@homeops/supabase` types or
`@homeops/shared`, vendor them into `src/lib/` rather than re-introducing
workspace deps.
