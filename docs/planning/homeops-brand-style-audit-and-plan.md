# HomeOps Mobile App — Brand & Style Guidelines Audit and Implementation Plan

**Document Type:** PM Audit + Action Plan  
**Author:** John (BMAD PM)  
**Date:** 2026-07-26  
**Status:** Action Required — Before Phase 0 Launch  

---

## 1. Executive Summary

**There are no formal brand or style guidelines for the HomeOps Mobile App.** What exists is scattered across three sources — the PRD, the architecture document, and hardcoded values in the codebase — and none of it constitutes a complete design system. This is a Phase 0 blocker: without a unified theme, every screen built from here on introduces visual drift that compounds into a product that feels inconsistent and untrustworthy.

---

## 2. What Exists Today

### 2.1 Brand Identity (from PRD v1.0 §2)

| Asset | Value | Status |
|-------|-------|--------|
| Consumer brand name | **HomeOps** | ✅ Locked |
| Package name (intended) | `com.homeops` (PRD) | ⚠️ Mismatch |
| Actual package name | `app.homeoperator.mobile` (app.json) | 🔴 Needs fix |
| App Store listing name | HomeOps | ✅ Confirmed |
| Campaign tagline | "Before you call. Before you pay. Before you make it worse." | ✅ Confirmed |
| B2B pitch name | HomeOps | ✅ Confirmed |
| Domain | homeops.app | ✅ Assumed |
| Logo / App Icon | Placeholder assets only (`assets/images/icon.png`, `splash.png`, `adaptive-icon.png`) | 🔴 No final design |
| Typography | Not defined | 🔴 Missing |
| Color palette | Not defined | 🔴 Missing |
| Design tokens | Not defined | 🔴 Missing |

### 2.2 Color Values Found in Codebase

All colors are hardcoded inline — no theme file, no variables, no tokens:

| Location | Value | Usage |
|----------|-------|-------|
| `app.json` | `#1a1a1a` | Splash background, adaptive icon background |
| `(broker)/_layout.tsx` | `#1a1a1a` | Header background |
| `(broker)/_layout.tsx` | `#ffffff` | Header text (`headerTintColor`) |
| `(broker)/_layout.tsx` | `#f5f5f0` | Content area background |
| `(broker)/_layout.tsx` | `#aaa` / `#999` | Sign-out text |
| `(consumer)/_layout.tsx` | `#1a1a1a` | Header background |
| `(consumer)/_layout.tsx` | `#ffffff` | Header text |
| `(consumer)/_layout.tsx` | `#f5f5f0` | Content area background |
| `web/globals.css` | `#ffffff` / `#0a0a0a` | Page background (light/dark) |
| `web/globals.css` | `#171717` / `#ededed` | Foreground text (light/dark) |

**Current palette (inferred):**
- Primary dark: `#1a1a1a` (near-black)
- Surface light: `#f5f5f0` (warm off-white)
- Text primary: `#ffffff` (on dark backgrounds)
- Muted: `#aaa` / `#999`
- Web only: `#0a0a0a`, `#171717`, `#ededed`

**Assessment:** Functional but incomplete. No accent/highlight color, no semantic colors (success, warning, danger, info), no dark mode palette for mobile, no disabled states.

### 2.3 Typography

- **Web:** Geist Sans + Geist Mono (Next.js default)
- **Mobile:** System default (no custom font configured)
- **No defined:** Type scale, weight hierarchy, letter spacing, line heights

### 2.4 Architecture Specification (Not Implemented)

The architecture doc specifies files that **do not exist yet:**

| Specified File | Purpose | Status |
|---------------|---------|--------|
| `apps/mobile/constants/theme.ts` | "Colors, typography, spacing" | ❌ Not created |
| `packages/ui/` | "Shared design tokens if needed" (Phase 1+) | ❌ Not created |
| `apps/mobile/components/ui/` | "Atoms: Button, Input, Card, Sheet, etc." | ❌ Not created |

---

## 3. What the Architecture Intends

From `homeops-architecture-v1.0.md`:

- **Phase 0 (current):** Broker walk-through, OCR, passport creation, invite delivery. Branding is limited to passport-level broker identity (agent name, photo, brokerage, contact) — no consumer-facing visual brand yet.
- **Phase 1 (next):** Consumer diagnostic. This is where the app becomes consumer-facing. Design system MUST be in place before consumer screens ship.
- **Phase 1+:** `packages/ui/` for shared design tokens across mobile and web.

**The architecture is sound — it defers the design system to when it's needed. That moment is now (Phase 0→1 transition).**

---

## 4. Gaps Identified

| # | Gap | Severity | Blocks |
|---|-----|----------|--------|
| 1 | No color palette defined (primary, secondary, accent, semantic colors) | 🔴 Critical | Consumer trust; visual consistency |
| 2 | No typography system (font family, type scale, weights) | 🔴 Critical | Readability; hierarchy |
| 3 | No spacing/touch-target system | 🟠 High | Accessibility; tap targets |
| 4 | No app icon or logo design | 🟠 High | App Store submission (iOS requires final icon) |
| 5 | No component library (Button, Input, Card, etc.) | 🟠 High | Developer velocity; consistency |
| 6 | No dark mode palette | 🟡 Medium | User preference; accessibility |
| 7 | Package name mismatch (`com.homeops` vs `app.homeoperator.mobile`) | 🟡 Medium | Store listing; deep links |
| 8 | `constants/theme.ts` specified but not created | 🔴 Critical | Technical debt; inconsistent screens |
| 9 | Broker passport branding has no visual design spec | 🟡 Medium | Passport PDF needs branded template |
| 10 | No design-to-code handoff process defined | 🟡 Medium | Process gap |

---

## 5. Implementation Plan

### 5.1 Phase Breakdown

```
Phase 0-A: Brand Foundation (1–2 days, before any more screens are built)
  ├── Define color palette (light + dark)
  ├── Define typography system
  ├── Define spacing scale (4px grid)
  ├── Create apps/mobile/constants/theme.ts
  ├── Create packages/ui/ with shared design tokens
  └── Fix package name to com.homeops

Phase 0-B: UI Component Atoms (2–3 days)
  ├── Build core atoms: Button, Input, Card, Text, Sheet, Icon
  ├── Build semantic components: SafetyStopCard, ConfidenceBar (already spec'd)
  ├── Retrofit existing screens to use theme
  └── Add dark mode support

Phase 0-C: Brand Assets (1–2 days, can overlap with 0-B)
  ├── Design app icon (iOS + Android adaptive)
  ├── Design splash screen
  ├── Design branded passport PDF template
  └── Design broker-branded invite email template
```

### 5.2 Official Color Palette (From HomeOps Brand & Style Guidelines v1.0)

The following palette aligns with the official HomeOps Brand & Style Guidelines v1.0, ensuring consistency across all applications:

| Color                 | HEX      | RGB             | Primary role                             |
|-----------------------|----------|-----------------|------------------------------------------|
| Safe Green 100        | `#DDEFD8` | `221, 239, 216` | Backgrounds, confirmation fields         |
| Safe Green 500        | `#5EAA63` | `94, 170, 99`   | Secondary brand fields, charts           |
| Command Green 700     | `#1F6F43` | `31, 111, 67`   | Primary logo, actions, headings          |
| Confidence Blue       | `#2F78C8` | `47, 120, 200`  | Links, navigation, support               |
| Action Orange         | `#F28C28` | `242, 140, 40`  | Attention, pending action                |
| Signal Teal           | `#3E9E9A` | `62, 158, 154`  | Diagnostics, data, pro features          |
| Domain Graphite       | `#35424B` | `53, 66, 75`    | Body text, authority, uniforms           |
| Warm White            | `#F7F3EA` | `247, 243, 234` | Primary canvas and packaging             |

**Recommended Distribution:**
*   Warm White / Safe 100: 65%
*   Command Green: 15%
*   Graphite: 10%
*   Blue / Teal: 7%
*   Orange: 3%

### 5.3 Official Typography System (From HomeOps Brand & Style Guidelines v1.0)

The typography suite is designed to be modern, capable, and direct, separating brand expression from operational readability.

| Role      | Style                            | Typical size   | Use                                      |
|-----------|----------------------------------|----------------|------------------------------------------|
| **DISPLAY** | Sora Bold                        | 40-64 pt / px  | Campaigns and hero moments               |
| **H1**      | Sora Bold or Inter Display ExtraBold | 28-40          | Page and screen titles                   |
| **H2**      | Inter SemiBold                   | 20-28          | Section titles                           |
| **Body**    | Inter Regular                    | 16-18 px / pt  | Reading and interface copy               |
| **Label**   | Inter Medium                     | 12-14 px / pt  | Controls, metadata, status               |

**Fallback Fonts:**
*   **Inter Display ExtraBold:** Approved fallback where Sora is unavailable, preserving a geometric, confident feel.
*   **System fallback (Arial or platform-native sans):** Use only when brand fonts cannot load, preserving hierarchy, spacing, and weight.

### 5.4 File Structure After Implementation

```
homeops-app/
├── apps/
│   └── mobile/
│       └── constants/
│           └── theme.ts            ← NEW: colors, typography, spacing
├── packages/
│   └── ui/                         ← NEW: shared design tokens + atoms
│       ├── src/
│       │   ├── tokens/
│       │   │   ├── colors.ts
│       │   │   ├── typography.ts
│       │   │   └── spacing.ts
│       │   └── components/
│       │       ├── Button.tsx
│       │       ├── Input.tsx
│       │       ├── Card.tsx
│       │       ├── Text.tsx
│       │       └── index.ts
│       ├── package.json
│       └── tsconfig.json
```

### 5.5 Sequence of Work

| Order | Task | Depends On | Assignee | Effort |
|-------|------|------------|----------|--------|
| 1 | Founder approves color palette and typography | — | Benjamin | 30 min |
| 2 | Create `packages/ui/` with design tokens | #1 | Dev (or BMAD agent) | 2h |
| 3 | Create `constants/theme.ts` importing from `@homeops/ui` | #2 | Dev | 1h |
| 4 | Fix package name to `com.homeops` in app.json | — | Dev | 15 min |
| 5 | Build core UI atoms (Button, Input, Card, Text) | #3 | Dev | 4h |
| 6 | Retrofit existing screens to use theme | #5 | Dev | 2h |
| 7 | Design app icon + splash screen | #4 | Designer (or AI gen) | 2h |
| 8 | Design passport PDF template | #1 | Dev / Designer | 3h |
| 9 | Add dark mode support | #3 | Dev | 2h |

**Total estimated effort: ~2 days** (can be parallelized; dev + design can proceed independently once #1 is locked)

### 5.6 Integration with Existing Development Queue

The current dev queue (from architecture §9 Phase 0 Build Sequence) is:

1. ✅ Supabase project + schema migrations (DONE)
2. ✅ Fly.io gateway skeleton (DONE)
3. ✅ Broker auth flow + role-based routing (DONE)
4. 🔄 Walk-through camera + OCR integration (IN PROGRESS)
5. ⬜ Passport creation + invite delivery
6. ⬜ Vercel web layer (public passport view, dashboard)
7. ⬜ EAS Build + TestFlight

**This style plan slots in between #3 and #4.** The theme foundation should be built BEFORE more screens are created (walk-through, scan-result, passport views). Retrofitting 4 existing screens is cheaper than building 10+ new ones without a theme and then retrofitting all of them.

### 5.7 Open Questions for Founder

| # | Question | Recommendation |
|---|----------|----------------|
| OQ-S1 | What accent color? | Teal/green-blue suggests calm + trust (healthcare-adjacent). Orange suggests energy + DIY. Blue is safe but generic. **Recommend: a warm teal** (`#0d9488` or similar) — signals "calm competence" matching the "before you panic" positioning. |
| OQ-S2 | Custom font or system default? | **System default for Phase 0–1.** SF Pro (iOS) and Roboto (Android) are excellent. Custom font adds bundle size, licensing, and rendering edge cases. Revisit at Phase 2 if brand needs differentiation. |
| OQ-S3 | App icon direction? | Minimal: the HomeOps "H" monogram on the dark `#1a1a1a` background. Clean, professional, recognizable at small sizes. AI-generated options as starting point. |
| OQ-S4 | Dark mode in Phase 0? | **Light-only for Phase 0.** Broker walk-through happens during daylight hours (showing homes). Dark mode is a Phase 1 consumer feature. |
| OQ-S5 | `com.homeops` vs `app.homeoperator.mobile`? | **Fix to `com.homeops` before TestFlight submission.** Once the bundle ID is in App Store Connect, changing it requires a new app record. Do it now. |

---

## 6. Risks of Deferring

If this work is deferred past Phase 0:

| Risk | Impact |
|------|--------|
| Every new screen adds visual inconsistency | Consumer trust eroded before Phase 1 launch |
| App Store rejects due to placeholder icon | Delays TestFlight by 1–3 days |
| Retrofitting 15+ screens instead of 4 | ~4x the effort later |
| Passport PDF looks unbranded | Broker adoption suffers — the passport IS the product in Phase 0 |
| Package name mismatch discovered at submission | Could require new App Store record, losing reviews/ratings |

---

## 7. Recommendation

**Build the theme foundation now — before walk-through camera screens are finalized.** It's ~2 days of work that prevents ~8 days of rework later. The architecture doc already specifies where these files go; the implementation is straightforward. The only blocker is founder approval on color palette and icon direction.

---

*HomeOps Brand & Style Audit and Plan — John (BMAD PM) — 2026-07-26*
