# HomeOps

**Before you call. Before you pay. Before you make it worse.**

HomeOps turns a tenant's appliance issue into a safe triage flow — deflecting
what can be fixed (Level 1) and handing a pre-diagnosed, single-visit dispatch
to a pro for what can't — then seeds a permanent Appliance Passport as the
Move-In Bridge.

## Repo layout

This is the full HomeOps app monorepo (extracted from `homeops-app`
2026-08-20, now the canonical home for app code):

```
apps/
  web/       Next.js 16 PWA — SMS zero-install tenant app + PM dashboard (Year 1)
  mobile/    React Native / Expo app (Year 2 — broker-first direction, archived)
packages/
  ui/        Shared React component library (empty shell, populated as needed)
  supabase/  Generated Supabase database types
  shared/    Shared TS utilities
services/
  gateway/   Backend gateway (Fly.io) — invite claim + public passport APIs
supabase/
  migrations/  SQL migrations
  functions/   Edge Functions (create-passport, create-passport-invite, ...)
docs/
  planning/    Product spine, UX walkthrough, app dev doc, architecture, plans
  mockups/     HTML mockups (A2 landing, B2 triage, B5 DIY, C3 dispatch, D2 passport)
  brand-assets/ Logos and marks
```

## Stack

- **PWA**: Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 — deploys to Vercel
- **Mobile (Y2, archived)**: React Native / Expo
- **Gateway**: Fly.io service
- **Database**: Supabase (Postgres + Edge Functions)
- **Orchestration**: pnpm workspaces + Turborepo

## Year 1 boundary

Year 1 = **B2B2C wedge**: Property Meld / Rent Manager PM integrations + **SMS
zero-install PWA** (no app store, no download). Native iOS/Android = **Year 2**.
The broker-first React Native direction and PRD v1.0 are archived — do not
build to them.

Canonical build doc: `docs/planning/homeops-app-development-document-v1.0.md`
(spine A1–E5, 10-Point Trust Constitution, banned-claims box, 12 open questions).

## Getting started

```bash
pnpm install

# PWA (Year 1 focus)
pnpm --filter web dev        # http://localhost:3000

# Everything (turbo)
pnpm dev
```

## Deploy

- **web** → Vercel (`apps/web/vercel.json` pins the build command)
- **gateway** → Fly.io
- **supabase** → Supabase project (migrations + functions)

## Security note

Supabase service-role keys and gateway secrets are read from the environment
(`Deno.env.get(...)`), never committed. `.env*` is gitignored (except
`.env.example`).

## Repo history note

Extracted from the `homeops-app` monorepo 2026-08-20 to give the Year 1 PWA a
clean standalone home. If a future build needs `@homeops/supabase` types or
`@homeops/shared`, they already live in `packages/` — no re-vendoring needed.
