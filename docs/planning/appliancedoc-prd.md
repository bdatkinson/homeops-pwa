# Product Requirements Document
## HomeOps (Working Title)
**Version:** 0.2 — Appliance Passport + Broker/PM Seeding Update
**Date:** 2026-07-14
**PM:** John (BMAD)
**Analyst:** Mary (BMAD)
**Status:** Draft — Pending Founder Review

_v0.2 changes: Added Section 3E (Real Estate Broker), Section 4C (Broker JTBD), F6 (Appliance Passport), F7 (Pre-Seeded Profile), updated Scope, Monetization sequence, and OQ-07._

---

## 1. Problem Statement

Homeowners, renters, and property managers face a moment of helplessness when a home appliance fails. They don't know whether to touch it, call someone, or pay whatever is quoted. Everyone else in the transaction — the technician, the landlord, the warranty company — knows more than they do. This information asymmetry costs homeowners billions annually in unnecessary service calls, inflated repair quotes, and premature appliance replacements.

**The core job:** *"Help me make the next correct move before I do something expensive or stupid."*

No existing product serves this job. Manufacturer support lines push replacement. YouTube is a gamble. Repair apps are vendor funnels. Property management platforms dispatch blind. And when a buyer or renter moves into a new home, they inherit appliances they know nothing about — no manuals, no history, no guidance.

---

## 2. Vision

A calm, trusted voice that stands between the homeowner and their next expensive or dangerous mistake. The app is used before anything else — before touching the appliance, before calling a tech, before approving a quote. It is always on the user's side. It never has a thumb on the scale.

A second vision layer, equally important: **the app knows your appliances before you need it.** A broker or property manager walks through a home, photographs each appliance's model plate, and seeds a location profile. When the buyer or renter activates the app, their appliances are already registered — manuals loaded, common issues flagged, maintenance history ready to begin. The app arrives as a gift, not a download.

**Brand direction (TBD — see OQ-01):** *Scout* (warm, active, report-generating) or *Second* (cool, second-opinion, structurally independent).

**Campaign line (confirmed):** *"Before you call. Before you pay. Before you make it worse."*

---

## 3. Target Customers

### 3A. Primary — Homeowner / Renter (Consumer)
- **Who:** Homeowner or renter facing an appliance failure. Age 25–65. Not a tradesperson.
- **Trigger moments:** Appliance making noise, showing error code, leaking, not heating/cooling, or completely dead.
- **Emotional state at moment of use:** Stressed, uncertain, afraid of being overcharged or making it worse.
- **Hire statement:** *"When my appliance fails, I want to know the next safe step and whether I'm about to get ripped off — without calling a stranger who profits from my confusion."*
- **Secondary hire statement (Passport):** *"When I move into a new home, I want to know what appliances I have, how old they are, and what to do when they break — before anything goes wrong."*

### 3B. Secondary — Property Manager (B2B)
- **Who:** Manages 50–500+ residential units. Lives in AppFolio, Buildium, or similar.
- **Trigger moments:** Tenant submits vague work order; tech returns with $0 fix that cost $150 to dispatch; tenant blames PM for pre-existing damage; unit turnover / new tenant move-in.
- **Hire statement (Dispatch):** *"When a tenant reports an appliance issue, I want a structured pre-diagnostic before I dispatch a tech — so I avoid unnecessary service calls, document the issue objectively, and protect myself from blame disputes."*
- **Hire statement (Passport):** *"When I turn over a unit, I want to document every appliance's make, model, age, and condition — so I have a defensible baseline record and can hand the new tenant an activated appliance profile on day one."*

### 3C. Tertiary — Property Management Platform (B2B2C)
- **Who:** AppFolio, Buildium, Yardi, DoorLoop, Property Meld.
- **Hire statement:** *"We want to offer a structured appliance diagnostic layer that auto-populates work orders and gives tenants a self-service path — so we can differentiate on AI-powered maintenance and win/retain enterprise PM accounts."*
- **Timeline pressure:** AppFolio AI Maintenance is in beta. Partnership window is 12–18 months.

### 3D. New — Real Estate Broker / Agent
- **Who:** Residential listing and buyer's agents. Performs walk-throughs of homes pre-listing, pre-closing, or at move-in.
- **Trigger moments:** Listing a home for sale or rent; conducting a buyer walk-through; closing on a property; move-in day handoff.
- **Hire statement:** *"When I walk through a home, I want to photograph each appliance's model plate and serial number to build an appliance passport for that property — so I can hand the buyer or renter a pre-seeded app profile as a premium closing gift that keeps my name attached to their home ownership experience."*
- **Value proposition to broker:** Differentiates them from other agents; reduces post-closing "the appliance broke" calls; creates a branded, lasting touchpoint with the buyer/renter; pairs naturally with home inspection data.

### 3E. Distribution Channels (not primary buyers — but critical to virality)
- **Helpers / tinkerers:** Recommend to neighbors. "Before I come over, run this and send me the report."
- **Parts store counter staff:** "Before you buy the part, diagnose it."
- **Home inspectors:** Walk-through appliance documentation as natural extension of inspection report.

---

## 4. Jobs-to-be-Done (Full Stack)

### 4A. Consumer JTBD
| Layer | Job |
|---|---|
| Functional | Diagnose the appliance issue and get a safe first step |
| Functional | Know whether to DIY, call a pro, or do nothing |
| Functional | Defend against an inflated repair quote |
| Functional | Document the issue before a landlord dispute |
| Functional | Know what appliances I have and their age/condition at move-in |
| Emotional | Feel competent, not helpless, in my own home |
| Emotional | Feel protected from being taken advantage of |
| Emotional | Feel prepared — not ambushed — when something breaks |
| Social | Be the person who figured it out / saved money |
| Social | Be the helper who sends the right tool to someone in need |

### 4B. Property Manager JTBD
| Layer | Job |
|---|---|
| Functional | Triage accurately before dispatching a technician |
| Functional | Generate a defensible maintenance record for the owner |
| Functional | Determine tenant-caused damage vs. normal wear & tear |
| Functional | Know repair vs. replace on aging appliances |
| Functional | Reduce after-hours emergency call volume |
| Functional | Document all appliances at unit turnover with model/serial/age |
| Functional | Pre-seed a new tenant's app profile at move-in |
| Functional | Maintain a portfolio-level appliance inventory |
| Emotional | Feel confident I'm not wasting owner money |
| Emotional | Feel protected in tenant blame disputes |
| Social | Be seen by owners as proactive and cost-conscious |

### 4C. Real Estate Broker JTBD
| Layer | Job |
|---|---|
| Functional | Document all appliances in a listing during walk-through (photo → model/serial) |
| Functional | Create a shareable appliance passport for a property |
| Functional | Pre-seed a buyer's or renter's app profile before closing |
| Functional | Provide a branded, lasting closing gift that delivers ongoing value |
| Functional | Reduce post-closing "the appliance broke — what do I do?" calls |
| Emotional | Feel like a premium, thorough agent who goes beyond the transaction |
| Emotional | Feel confident the buyer is set up for success after closing |
| Social | Be seen as the agent who thinks of everything |
| Social | Stay top-of-mind with past clients without being intrusive |

---

## 5. Product Scope

### Phase 1 (MVP — Consumer Diagnostic)
**In Scope:**
- Voice and text diagnostic interface (mobile-first)
- On-device model trained on appliance user and service manuals
- Low-latency voice response
- Coverage: **3 appliance categories** — dishwasher, washer/dryer, refrigerator
- Structured diagnostic output (the "Scout report" / "Second opinion")
- Audience-specific artifact export: self, technician, landlord, helper
- Safety stop logic: explicit "do not proceed — call a pro" for gas, electrical, refrigerant, water damage risk
- Calibrated confidence display ("70% likely drainage issue — these two checks are safe")
- Handyman handoff: user-initiated, opt-in, with full diagnostic summary shown before submission
- Privacy: local-first, no audio retention without consent, no ads, no surveillance
- **Manual appliance registration** (user photographs model plate to register appliance)

**Out of Scope (Phase 1):**
- Pre-seeded profile delivery to buyer/renter
- Broker / PM walk-through mode
- Portfolio-level appliance inventory
- B2B API integration with AppFolio/Buildium/Yardi
- Paid per-case second opinions
- Pro/helper workflow tools
- Marketplace / referral revenue
- Coverage beyond 3 core appliance categories

### Phase 2 (Appliance Passport + Broker/PM Seeding)
**In Scope:**
- **Walk-through mode** — broker or PM uses app camera to photograph model plate → OCR extracts make, model, serial number, estimated age
- **Location profile** — collection of all appliances at a property address
- **Pre-seeded profile delivery** — broker/PM generates a QR code or invite link; buyer/renter scans/clicks to activate app with appliances pre-loaded
- **Branded passport** — optional agent/PM branding on the appliance passport (agent name, logo, contact)
- Maintenance history log per appliance
- Recall alerts by model number
- Warranty storage
- Seasonal maintenance reminders
- QR sticker generation (print-and-stick on appliance for instant future lookup)
- Expanded appliance coverage (HVAC, water heater, oven/range, microwave)

---

## 6. Key Features

### F1 — Voice/Text Diagnostic Engine
- Wake-word or tap-to-activate voice input
- Socratic dialogue flow: asks targeted questions to narrow diagnosis
- Pulls from on-device manual corpus (model + serial number lookup)
- Returns: likely issue, confidence level, safe first steps, "stop here" if dangerous

### F2 — Structured Diagnostic Summary (The Report)
- Auto-generated after each session
- Fields: appliance model, symptoms described, steps attempted, likely issue, confidence, recommended action, safety flags
- Exportable by audience type (plain language for tenant/landlord; technical for technician)
- Timestamped (supports quote defense and dispute documentation)

### F3 — Safety Stop System
- Explicit category rules: gas smell → immediate stop + call pro; standing water + electrical → stop; refrigerant → stop
- "Do not proceed" as a first-class, revenue-compatible output
- Safety stop reason explained in plain language

### F4 — Handyman Handoff (Opt-In)
- Triggered only after: (a) safe DIY steps exhausted, (b) user explicitly requests
- User sees full diagnostic summary before any contact info is submitted
- Multiple options shown where available
- Referral compensation disclosed at point of choice
- User can export summary and use any provider — no lock-in

### F5 — Confidence Calibration Display
- Every diagnosis shows a confidence level and its basis
- Distinguishes between "likely" (safe to try) and "possible" (needs pro confirmation)
- Surfaces uncertainty explicitly — never implies omniscience

### F6 — Appliance Passport (Phase 2)
- Per-appliance record: make, model, serial number, estimated manufacture/install date, manual, known issues, recall status
- Per-property location profile: all appliances at an address
- Repair history log: timestamped diagnostic sessions, actions taken, outcomes
- Maintenance schedule: filter changes, cleaning cycles, seasonal checks
- Warranty storage: upload warranty docs, track expiration
- QR sticker generation: print-and-stick labels that deep-link to that appliance's profile
- Full data export: user owns their data, always exportable

### F7 — Pre-Seeded Profile (Broker / PM Walk-Through Mode) (Phase 2)
- **Walk-through capture:** dedicated mode for broker/PM; camera → model plate OCR → auto-populate appliance record
- **Location profile creation:** group appliances by property address
- **Profile invitation:** generate QR code or shareable invite link tied to that location's appliance set
- **Buyer/renter activation:** new user scans QR or clicks link → account created with appliances pre-loaded, no manual entry required
- **Branded delivery:** optional agent/PM name, photo, contact info on the passport ("Your appliance passport, prepared by [Agent Name]")
- **Handoff moment options:** QR code on closing documents, NFC tap card, printed sticker on appliance, email/SMS link at move-in
- **PM portfolio view:** property manager sees all locations, all appliances, upcoming maintenance, open diagnostic sessions across their portfolio

---

## 7. Trust Constitution (Non-Negotiable Product Rules)

These rules are pre-code commitments. They cannot be overridden by growth or revenue pressure.

1. **Diagnosis is never marketplace-ranked.** The diagnostic engine cannot know which providers pay.
2. **User always sees the summary before any handoff.** No hostage-taking.
3. **"Export to anyone" is always free.** The app never traps the user inside its network.
4. **Compensation is disclosed at the choice point.** Not buried.
5. **"No action" is a first-class outcome.** The app must be able to say "leave it alone" and mean it.
6. **Confidence is shown, not implied.** Every recommendation shows likelihood and risk.
7. **Pro-only boundaries are conservative and explicit.** When in doubt, stop and refer.
8. **Post-outcome feedback is built in.** No feedback loop = no trust claim.
9. **Bad outcomes cost the company something.** Refunds, credits, or public accuracy reporting.
10. **The diagnostic engine is firewalled from marketplace incentives.** Permanently.
11. **The buyer/renter owns their profile data.** The broker/PM who seeded it cannot revoke, surveil, or monetize it. Seeding is a gift, not a claim.

---

## 8. Success Metrics

### Phase 1 Metrics
| Metric | Target | Notes |
|---|---|---|
| % sessions ending in safe no-action | Baseline TBD | "Do nothing" must be a viable, common output |
| % DIY success confirmed after 7 days | >60% | Post-session follow-up prompt |
| % recommendations with cited source | 100% | Every diagnosis cites the manual section |
| Safety stop acceptance rate | >90% | User follows "call a pro" directive |
| "Would you trust this next time?" | >80% positive | Post-resolution prompt |
| Handoff opt-in rate | Baseline TBD | Measures demand, not conversion pressure |
| Confidence calibration error | <15% | Predicted vs. actual outcome match |

### Phase 2 Metrics (Passport + Seeding)
| Metric | Target | Notes |
|---|---|---|
| % pre-seeded profiles activated by buyer/renter | >50% | Measures gift-to-activation conversion |
| Appliances registered per activated profile | >3 | Validates walk-through completeness |
| Broker/PM repeat passport creation rate | >70% | Validates product-market fit with B2B |
| Maintenance reminder engagement rate | >30% | Signals ongoing value beyond crisis |

---

## 9. Monetization Sequence

Phase 1 is **free with no monetization.** Trust must be established before any revenue mechanism is introduced.

1. **Phase 1** — Free diagnostic + safety triage (consumer)
2. **Phase 2** — Appliance Passport: free for consumer self-setup; **paid for broker/PM walk-through mode** (per-property or subscription)
3. **Phase 3** — Paid per-case second opinions (repair vs. replace, quote review) — consumer pays per event
4. **Phase 4** — Helper / property manager workflow tools (B2B SaaS)
5. **Phase 5** — PM platform API integration (AppFolio, Buildium, Yardi)
6. **Phase 6** — Transparent referral marketplace under Trust Constitution

**Key insight:** The Passport is the first natural monetization gate. Brokers and PMs have a clear ROI case (reduced post-closing calls, defensible move-in records, tenant goodwill). Consumer self-setup remains free. B2B walk-through mode is the paid tier.

---

## 10. Competitive Landscape

| Competitor | Gap HomeOps Fills |
|---|---|
| Manufacturer support lines | Push replacement, not diagnosis |
| YouTube repair videos | Unstructured, no model-specific intelligence, no safety logic |
| TaskRabbit / Angi | Vendor funnels — diagnosis = dispatch trigger |
| AppFolio AI Maintenance | PM-side only, no consumer diagnostic, no manual corpus, no passport |
| Property Meld | Workflow tool, not diagnostic |
| ChatGPT | No on-device model, no manual corpus, no appliance-specific safety logic, no structured report |
| Home inspection apps | Document condition, not ongoing diagnostic intelligence |
| **No existing product** | Pre-seeds a buyer/renter's appliance profile before they move in |

---

## 11. Open Questions (Founder Decisions Required)

| # | Question | Why It Matters | Options |
|---|---|---|---|
| OQ-01 | **Final name?** | Brand name affects every downstream decision — app store, domain, B2B pitch | Scout / Second / FirstCall / SecondLook / RightStep |
| OQ-02 | **Consumer-first or B2B-first GTM?** | Determines build sequence, partnership strategy, revenue timeline | A) Consumer free app → viral → PM/broker discovery; B) Broker/PM passport first → consumer app distributed via pre-seeded invites |
| OQ-03 | **On-device model scope?** | 500MB constraint. Full manual corpus vs. curated subset? | A) Full corpus OTA download post-install; B) Curated top-500 appliance models only |
| OQ-04 | **Handyman handoff — Phase 1 or defer?** | Revenue model tension. Deferring is cleaner for trust | A) Build in Phase 1 as opt-in; B) Defer to Phase 2 |
| OQ-05 | **Android-first or iOS-first?** | Current dev environment is Android (S21 Ultra) | A) Android first; B) Simultaneous (higher cost) |
| OQ-06 | **HomeOps repo — rename or fork?** | Name change affects GitHub, CI, package IDs | A) Rename when name is final; B) Fork to new repo |
| OQ-07 | **Passport Phase: broker/PM paid model?** | First monetization gate. Per-property fee vs. subscription | A) Per-property creation fee ($5–15/passport); B) Monthly subscription (unlimited passports for portfolio); C) Free for all, monetize downstream |

---

## 12. Appendix — Source Documents

All source artifacts are in the HomeOps NotebookLM notebook:
- JTBD Dialectic (R1–R3 + Synthesis) — homeowner/consumer
- Naming Dialectic (R1–R3 + Synthesis) — Scout/Second shortlist
- Property Manager Platform Research
- JTBD Analysis: Property Manager & Platform (Mary/BMAD)
