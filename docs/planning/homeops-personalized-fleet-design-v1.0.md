# HomeOps — Personalized-Fleet Architecture (Diagnostic Packs + Runtime Model Strategy)

**Version:** 1.0
**Date:** 2026-08-16
**Architect:** Hermes (successor to `homeops-diagnostic-extraction-slm-plan-v1.0.md`)
**Status:** Working Draft — feeds writing-plans + Kanban execution; grounded by a real feasibility spike (`~/homeops/_bmad-output/spikes/personalized-fleet/`)

> **Purpose:** Define the next design layer: what happens when the diagnostic system is *personalized* to a user's specific 3–4 appliances (their "fleet"), rather than serving 48 brands generically. This document answers the end-to-end flow, re-evaluates the model strategy under fleet personalization, specifies the per-model **diagnostic pack** format, reshapes extraction and training priorities, updates the licensing posture, and reports real spike numbers. It inherits the DKM schema and three-channel extraction from the extraction-SLM plan, and the hybrid RAG + small-model thesis + OQ-02 licensing posture from the data-prep plan.

---

## Table of Contents

1. [Fleet Scenario & User Flow](#1-fleet-scenario--user-flow)
2. [Architecture — Packs + Adapters + Runtime](#2-architecture--packs--adapters--runtime)
3. [Model Recommendation Matrix](#3-model-recommendation-matrix)
4. [Extraction Implications — The Diagnostic Pack Format](#4-extraction-implications--the-diagnostic-pack-format)
5. [Training Implications — Per-Family LoRA + Synthetic Households](#5-training-implications--per-family-lora--synthetic-households)
6. [Licensing & Risk Posture](#6-licensing--risk-posture)
7. [Phased Plan with Gates](#7-phased-plan-with-gates)
8. [Feasibility Spike Results (real numbers)](#8-feasibility-spike-results-real-numbers)
9. [Open Questions for Benjamin](#9-open-questions-for-benjamin)

---

## 1. Fleet Scenario & User Flow

### 1.1 The scenario

A HomeOps user owns **3–4 appliances** — e.g. an LG washer `WM3700HWA`, a Whirlpool
dryer `LEW0050PQ`, a Samsung fridge `RF28R7201`, a Bosch dishwasher (800 Plus series).
They scan/register each one; from then on the system serves diagnostics **only** for
those exact models, on-device where possible. Everything the system needs to know about
those four machines is a **few tens of kilobytes**, not the 16 GB corpus.

### 1.2 End-to-end flow

```
ONBOARDING (already shipped, needs the "resolve packs" extension):
  walk-through-scan (OCR model tag → fuzzy match model_registry, 7,849 rows)
     → create-passport (passport = {user, appliances[]})
     → NEW: passport.fleet → resolve each appliance → pack manifest
        (pack_id + version + content_hash + optional adapter_id)
     → background download of the fleet bundle to device:
        3-4 diagnostic packs (~tens of KB total) + 1-3 LoRA adapters (few MB each)
     → local pack index built (SQLite FTS5 + in-memory exact-match dict)

FIRST DIAGNOSTIC USE (runtime):
  user symptom → SLM classifies symptom + picks clarifying questions
     → retrieves from the LOCAL fleet pack index (µs-scale, §8)
     → executes the retrieved DiagnosticProcedure branch by branch
     → safety gate (safety_level 3-4 → stop/defer)
     → emits structured diagnostic package handoff for technician

OTA / PACK UPDATE (continuously):
  app polls pack registry (Supabase diagnostic_packs table) on launch + passport change
     → version + content_hash compare → delta or full pack download
     → signature verify (Ed25519) → swap pack → rebuild index
  corpus scraper (15-min cron) → extraction pipeline re-runs for changed/added manuals
     → new pack versions published to the registry
```

**Data placement:**

| Data | Cloud (Supabase/gateway) | Device (local) |
|---|---|---|
| model_registry (7,849) + CPSC recalls | ✅ (scan-time) | — |
| passport + appliance list | ✅ (source of truth) | cached copy |
| **diagnostic packs (fleet only)** | ✅ (pack registry, versioned/signed) | ✅ **primary runtime source** |
| **LoRA adapters (fleet brands)** | ✅ (adapter registry) | ✅ loaded at runtime |
| conversation history / dialogue | optional (T0) | ✅ default (T2 privacy) |
| base model weights | T0/T1 | ✅ T2 (on-device SLM) |

The **architectural invariant**: the pack is the source of *facts*; the model is the
source of *dialogue, safety judgment, and step execution*. Neither is asked to memorize
the other's job.

### 1.3 Why this is the right shape

| Alternative | Verdict |
|---|---|
| **One general model for everyone, packs + adapters personalize** | ✅ **This design.** Small, cacheable, auditable, per-model validated. |
| Per-user fine-tune | ❌ Infeasible — no per-user training data, no per-user serving cost story. |
| One giant context (ship 16 GB corpus / 131K-ctx model holding manual chunks) | ❌ Wasteful — 99.9% of the context is for machines the user doesn't own. |
| Pure cloud RAG | ⚠️ Works now (T0) but is a privacy regression vs. Trust Constitution Rule 14; keeps per-turn network dependency. |

---

## 2. Architecture — Packs + Adapters + Runtime

### 2.1 The three artifacts

1. **Base model (one for everyone)** — conversational front-end + safety gate +
   decision-tree executor. Doesn't need to know any specific appliance; it needs to
   (a) ask good clarifying questions, (b) read a retrieved DiagnosticStep and render it,
   (c) never exceed the step's `safety_level`.
2. **Diagnostic pack (per model)** — a small, validated, versioned, signed JSON bundle
   of DKM records for one exact model (error codes, procedures, safety rules, parts).
   This is the *only* thing carrying per-model facts. (§4 spec, §8 real sizes.)
3. **LoRA adapter (per brand/model-family, optional)** — a few-MB weight delta that
   tunes the base model's *format/voice* to a brand (e.g. "LG washer" phrasing) and
   reinforces family-specific safety reflexes (gas vs electric dryer). Swapped at
   runtime by `passport.fleet` brand set. Facts still come from packs, not the adapter.

### 2.2 Runtime composition

```
user turn
   │
   ▼
[base model + {family LoRA adapters for the fleet's brands}]  ← dialogue + safety + executor
   │  (retrieval is a tool call, not a prompt dump)
   ▼
[fleet pack index — local, µs-scale]  ← exact-match error codes, FTS5 symptoms,
   │                                     procedure traversal, parts, safety_level
   ▼
structured diagnostic package  (technician handoff)  +  consumer next step
```

Key consequence: **context window is no longer the binding constraint.** The spike shows
the entire 4-appliance fleet is ~4,810 tokens (subset) / ≤ ~60K tokens (full). A 4–8K
context holds a fleet's packs inline; no 131K window, no chunk-retrieval machinery, no
vector DB on-device.

### 2.3 Pack/adapter distribution surface

- **Pack registry** (Supabase table `diagnostic_packs`): `pack_id, model_number, brand,
  category, schema_version, content_hash, ed25519_sig, compressed_blob, updated_at,
  source_doc_refs[]`.
- **Adapter registry**: `adapter_id, brand/family, base_model_id, adapter_bytes,
  content_hash, updated_at`.
- Fleet bundle = `{packs: [4], adapters: [1-3]}` resolved from the passport; downloaded
  once, updated on version bump.

---

## 3. Model Recommendation Matrix

### 3.1 The reframing (why fleet personalization changes the answer)

v1.0 (data-prep) and the extraction plan ranked **Maple-Preview 20B-A1B** primary on two
grounds: (1) 131K context to hold manual chunks in RAG, (2) SOTA reasoning + standard
LoRA. **Both grounds shift under fleet personalization:**

- **The 131K context advantage disappears.** The fleet's facts are a few KB, not many
  manual chunks. A 4–8K window is enough.
- **The model's job shrinks.** It is no longer asked to *recall* error codes; it executes
  retrieved ones. Factual recall — where large models earn their keep — is outsourced to
  the packs.

This lowers the on-device bar from "reasoning model that can hold a corpus" to
"instruction-following model that can hold a conversation + a few KB of retrieved steps."

### 3.2 Recommendation matrix (model × tier × fleet-size assumption)

| Model | Footprint | Tuning | T0 cloud | T1 served/edge (many fleets) | T2 on-device (1–4 packs) | Fleet verdict |
|---|---|---|---|---|---|---|
| **TinyML literal µC-class** (ESP32/Pico, KB RAM) | KB–MB RAM | n/a | — | — | ❌ cannot run a text LLM | **Still no.** Packs shrink *data*, not the *model*; an LLM needs hundreds of MB of weights. |
| **Qwen3 1.5B / 3B** | 1–3 GB (GGUF 4-bit ~1–2 GB) | ✅ standard LoRA | — | ⚠️ | ✅ **PRIMARY T2** | Packs carry facts → 1.5–3B is enough for dialogue+safety+JSON. Cheap, proven, Apache-2.0. |
| **Phi-4-mini 3.8B** | ~2.5 GB | ✅ standard LoRA | — | ⚠️ | ✅ T2 contender | Strong instruction-following; MIT. |
| **Gemma 3n 1–4B** | 1–4 GB | ✅ standard LoRA | — | ⚠️ | ⚠️ T2 (license review) | On-device optimized; Gemma terms need review. |
| **Bonsai 8B ternary** | 1.75 GB | ⚠️ Bankai XOR only | — | ⚠️ | ⚠️ viable only if zero-shot suffices | Great footprint, but (a) needs PrismML's mlx/llama.cpp fork, (b) **cannot take LoRA adapters** → breaks the per-family adapter strategy. |
| **Maple-Preview 20B-A1B** | 5.31 GB, 131K ctx | ✅ standard LoRA | ✅ (T0 alt) | ✅ **PRIMARY T1** | ❌ too big for phone | Kept for T1 where it serves *many* fleets at once; its 131K-ctx RAG advantage is moot per-fleet but valuable per-server. |

### 3.3 Direct answers to the task's questions

- **Does Bonsai become clearly viable?** Partially — *for the footprint*, yes; the
  ternary 1.75 GB is ideal. But two blockers remain and one is now decisive: (a) Bankai
  tuning is still immature, and (b) Bonsai **cannot take per-family LoRA adapters**
  (Bankai XOR patches ≠ LoRA), so it can't participate in the adapter personalization
  layer. **Recommendation: keep Bonsai as a zero-shot pack-executor spike only; it is not
  the adapter-compatible base.**
- **Does a 0.5–1.5B model become enough?** A **1.5–3B** model becomes the on-device
  sweet spot — it is enough for dialogue + safety + step execution over a tiny retrieved
  context. **0.5B is borderline** (reliable safety gating and multi-turn dialogue are the
  risk); reserve it for a distilled single-task "error-code explainer" if needed.
- **What does LoRA-per-family do to base-model choice?** It *requires* a standard-LoRA
  architecture — which eliminates Bonsai and favors **Qwen3 / Phi-4-mini / Maple**.
  It also means the base model's role is format+voice+reflex, not knowledge, so the
  selection is driven by inference footprint + tooling + safety floor, not reasoning
  ceiling.

### 3.4 Model decision summary

| Tier | Model | Rationale |
|---|---|---|
| T0 (ship now) | cloud LLM + fleet-pack retrieval | No training; packs improve it immediately. |
| T1 (served/edge, Phase 2) | **Maple-Preview 20B-A1B** (LoRA per family) | Serves many fleets per box; reasoning floor; standard LoRA. |
| T2 (on-device, Phase 3) | **Qwen3 1.5B/3B (or Phi-4-mini)** + fleet packs + family LoRA | Packs carry facts; small model executes. Bonsai = zero-shot spike only. |

---

## 4. Extraction Implications — The Diagnostic Pack Format

### 4.1 The unit of extraction becomes the pack, not the document

Extraction still runs the DKM pipeline (three channels, S1–S6), but its **output unit**
is the per-model-family **diagnostic pack**, keyed by `model_number` (cross-referenced to
`model_registry`), not by PDF. One service manual covering many models (e.g. Bosch
`SHE-SHX-SHV-RepairManual.pdf`) emits **multiple packs**, splitting records by
`model_scope`.

### 4.2 Pack format spec (v1)

```jsonc
{
  "pack_version": "1.0.0",          // semver
  "schema": "dkm-v1",               // ties to DKM schema version
  "pack_id": "lg:wm3700hwa:washer:1",// canonical id (brand:model:category:rev)
  "model": { "brand", "model_number", "family", "category", "appliance_type" },
  "provenance": {
    "source_docs": ["LG-WM3700HWA-FrontLoadWasher-ServiceManual.pdf"],
    "source_pages": {"error_codes": "21-27", ...},
    "extraction_method": "Channel A|B|C",
    "license_tag": "derived/synthesized",   // OQ-02 gate
    "copyright_notice": "..."               // retained, not stripped
  },
  "error_codes":   [ ErrorCodeRecord... ],   // code, meaning, likely_cause, action,
                                             // safety_level, model_scope, source
  "symptoms":      [ SymptomRecord... ],     // canonical + variants + procedure_ref
  "procedures":    [ DiagnosticProcedure... ],// steps[] with pass/fail branches,
                                             // expected_value (ohms/volts), tools[]
  "parts":         [ {name, ref, when} ],    // part reference for handoff
  "safety_rules":  [ {level 1-4, rule} ],    // per-model (gas vs electric differ)
  "references":    [ "pack_id" ]             // cross-pack refs (multi-model conflict)
}
```

**Versioning & signing:** `content_hash` (SHA-256 over canonical JSON) + `ed25519_sig`
signed by the pack server. Clients verify before swap. **Compression:** zstd (or gzip)
— spike shows ~2–3× over raw JSON. **Update cadence:** pack registry polled on app
launch + passport change; version-bump → delta/full download; corpus scraper →
re-extraction → new version published (typically weekly, or immediately on recall/safety
erratum).

### 4.3 Conflict handling (one pack references another model)

- Multi-model manuals split by `model_scope` at S3 (normalize). A record shared across
  models appears in each pack with `model_scope` narrowed, or once with `references`
  pointing at sibling packs.
- Same code, different meaning across brands → **never silently merge** (S4 conflict
  report, per extraction plan). In packs, conflicts are impossible by construction: each
  pack is single-model, so a code is interpreted only in its own model's context.
- Cross-appliance references (e.g. a washer procedure that says "if dryer makes noise…")
  become `references` edges consumed by the synthetic-household training/eval (§5.4).

### 4.4 Extraction priority shifts to top-N model families

Personalization means we only need **depth on the models people actually own**, not
breadth across 70,400 models. Priority = top-N families by market share, cross-referenced
against `model_registry` (7,849 rows) + corpus coverage:

| Tier | Families | Rationale (Q1 2026 market share) |
|---|---|---|
| **P0** | Top ~50 families | LG (#1 18.7% unit), GE 16.4%, Whirlpool 14.5%, Samsung 12.4% — covers the majority of real households. Category leaders: fridges=LG, front-load=LG, top-load=Whirlpool, dishwashers=Bosch(premium)/Whirlpool(volume), cooking=GE. |
| **P1** | Top ~100 families | Long tail of the big-4 + Electrolux/Frigidaire/BSH/Bosch core. Covers ~80–90% of scan events. |
| **P2** | Everything else | Opportunistic; only via cron scraper finds. Served by generic-brand packs + cloud RAG fallback. |

**Pack generation gate (per pack):** (1) round-trip validation ≥80% (records answerable
from source text), (2) safety-level audit (no level-3/4 step lacks a warning), (3)
model_number resolves against `model_registry`, (4) error-code meanings paraphrased not
copied verbatim (licensing), (5) provenance + license tag present.

---

## 5. Training Implications — Per-Family LoRA + Synthetic Households

### 5.1 Fine-tuning targets the top-N families

We no longer fine-tune "one model that knows all brands." We fine-tune:

- **One base model** (Qwen3/Phi/Maple) for the *role* — dialogue, safety gating,
  DKM-schema JSON output, "retrieve-then-execute" behavior. Trained once on a small,
  brand-mixed, licensing-clean dataset.
- **Per-family LoRA adapters** for the top-N families (a few MB each) — trained on
  per-family instruction pairs synthesized **from validated packs** (satisfies OQ-02:
  derived data, traceable provenance). An adapter tunes voice/format + family-specific
  safety reflexes, never raw facts (those stay in packs).

### 5.2 Per-family eval

Reorganize the 200-question held-out eval set (v1.0 P1-W5) **by family**, and add:

- Per-family error-code accuracy (exact match), symptom→procedure selection, safety
  refusal rate (family-specific: gas-dryer vs electric-dryer scenarios).
- **Pack-consistency check**: model answer must be traceable to a retrieved pack record;
  any code/part/ohm-value the model emits that isn't in the fleet's packs = hallucination
  (the citation-required rule from v1.0 P1-W6 becomes pack-scoped and therefore cheaper
  to enforce).

### 5.3 Adapter size economics

A LoRA adapter at r=16–64 on a 1.5–3B base is ~**5–50 MB** (vs. a 5.31 GB full model).
A fleet of 4 appliances typically needs **1–3 adapters** (one per distinct brand). The
personalization payload stays at "few MB + few tens of KB," not "few GB."

### 5.4 NEW — Synthetic households (multi-appliance, multi-turn)

A real user owns 4 appliances; dialogue **spans them**. New training/eval asset:

> *"The dryer is making a weird noise after I ran the washer."* → the model must (a)
> recognize the washer is *not* the current fault, (b) reason about transfer (load size,
> balance, venting), (c) pivot to the dryer pack and run the dryer's noise procedure,
> (d) keep both packs' safety rules in scope.

Synthetic-household generation:
- **Households** = random 3–4 appliance tuples drawn from top-N families (e.g.
  `{LG washer, Whirlpool electric dryer, Samsung fridge, Bosch DW}`). Use the verified
  market-share distribution so households are representative.
- **Scenario templates** = cross-appliance dialogues: transfer/sequence ("after I ran X,
  Y does Z"), shared subsystems (laundry pair venting), simultaneous failures,
  ambiguous pronoun ("it won't start" — which appliance?), safety cross-talk (gas dryer
  near a washer leak).
- **Eval split**: hold out N households per family; measure cross-appliance accuracy +
  correct pack selection.

This is the training dataset where fleet personalization adds value the generic model
cannot: **correct pack routing under ambiguity** and **multi-appliance safety
reasoning**.

### 5.5 Safety rules are per-pack

Gas dryer vs electric dryer safety rules differ (gas leak → evacuate, no spark vs
electrical → disconnect). These live **in the pack's `safety_rules`** and are reinforced
by the family adapter. The safety pre-filter (PRD §6) reads the *fleet's* rules, not a
global list — so a gas-dryer owner gets gas rules, an electric-dryer owner gets
electrical rules, never a blended superset.

---

## 6. Licensing & Risk Posture

### 6.1 Does the fleet model improve the OQ-02 posture? — **Yes, materially.**

OQ-02 (data-prep plan) requires: *train ONLY on derived/synthesized data, not raw manual
text.* Fleet personalization strengthens this on three axes:

| Axis | Generic model | Fleet model |
|---|---|---|
| Distribution surface | 5 GB model whose weights embed 48 brands of copyrighted text | ~tens of KB of derived/synthesized records + a few-MB LoRA adapter per user |
| Provenance | Weights are a black box | Every pack record carries `source_docs` + `license_tag` + `copyright_notice` |
| Extraction form | Raw chunks → training pairs | Packs are *paraphrased/normalized* records (round-trip-validated, not verbatim tables) |
| Per-user specificity | Ships everything to everyone | Ships only what that user's machines need |

Shipping a small, versioned, per-model bundle of *derived* data is far closer to the
"search index / factual reference" precedent (Posture A, Embed + Cite) than shipping a
model with all brands baked in. The pack is a structured **reference**, not a
derivative-work **reproduction** — provided extraction paraphrases error-code *meanings*
rather than copying tables verbatim.

### 6.2 What stays risky

1. **The LoRA adapter still embeds derived-from-copyrighted data into weights.** Smaller
   and family-scoped, but the fine-tuning question doesn't disappear — it shrinks.
   Mitigation: same synthesized-data-only rule; per-family legal review gate.
2. **Extraction verbatim-copy risk.** Error-code tables are the most copy-prone content.
   Mitigation: paraphrase meanings; keep codes (short, factual, not copyrightable) but
   synthesize `meaning`/`action` text.
3. **The corpus is still manufacturer-copyrighted at the source.** The pack server
   must not redistribute raw manual text — only derived records. Pack provenance must
   cite the source doc for transparency without embedding the source text.
4. **Unchanged**: the OQ-02 legal-review gate before *any* fine-tune remains mandatory;
   the fleet model lowers exposure but does not eliminate it.

### 6.3 Net posture

> **Fleet personalization converts the licensing question from "can we ship a model
> trained on 3,650 manuals" to "can we ship a 20 KB derived reference for the 4 machines
> a user owns."** The latter is defensible under the Embed-and-Cite / factual-reference
> posture; the former is not. The risk surface scales with *per-user pack size × fleet
> size*, not with *corpus size*.

---

## 7. Phased Plan with Gates

```
NOW (no DKM pipeline, no training, no licensing gate — reuse spike):
├── Pack server (Supabase table + gateway read path)                         [1-2 days]
├── Pack format v1 + validation/signing tooling                               [1 day]
├── 3-5 hand-built sample packs from real corpus manuals                      [DONE in spike]
└── GATE: pack format + registry + signing reviewed; sample packs load on-device

WEEK 1-2 — EXTRACTION PILOT (per extraction plan, reframed to pack output):
├── S1-S6 on 1 brand family → emit real packs (not loose JSON)
├── Pack validation gates (§4.4) automated
├── Fleet bundle resolver (passport → packs + adapters)
└── GATE: ≥80% round-trip; safety audit clean; pack sizes measured end-to-end

WEEK 3-5 — EXTRACTION SCALE (top-100 families, not all 48 brands):
├── Prioritize top-50 families (P0) → packs for the models people actually own
├── Knowledge dedup at pack level; conflict report
├── Pack registry populated; on-device index + latency validated
└── GATE: top-50 families covered; per-pack conflict rate <5%

WEEK 5-7 — TRAINING (base role model + per-family LoRA):
├── Base-model instruction pairs (role: execute-retrieved-steps)             [v1.0 P2-W1/W2/W3]
├── Per-family LoRA on synthesized pack-derived pairs (top-10 families first)
├── Synthetic households (multi-appliance eval + training)                   [NEW §5.4]
├── Per-family eval + pack-consistency hallucination check
└── GATE: zero DANGEROUS ratings (incl. gas-vs-electric); accuracy ≥85% codes / ≥75% symptoms

WEEK 8+ — DEPLOY:
├── T1 served SLM (Maple + family LoRA) behind gateway
├── T2 on-device (Qwen3 1.5B/3B + fleet packs + family LoRA)
└── Continuous: cron scraper → re-extract → pack version bump → OTA
```

**Effort estimate:** ~80–100 person-hours total (pack server + resolver ~2d, extraction
reframe mostly reuses the extraction plan, training reuses v1.0 P2 with per-family split
+ synthetic households ~3-4d). Roughly 3–4 weeks solo founder + AI agents, consistent
with the two predecessor plans.

**Hard gates (no skipping):**
1. Pack format + signing + registry reviewed before extraction scale.
2. Round-trip validation ≥80% per pack before any training data.
3. OQ-02 licensing sign-off (derived-data posture) before any fine-tune — **unchanged**.
4. Zero DANGEROUS ratings on 50 safety scenarios, now **including gas-vs-electric**.
5. Model scorecard from the spike harness (extraction plan §3.4), now evaluated
   **pack-scoped** (does the model execute retrieved steps correctly, not recall facts).

---

## 8. Feasibility Spike Results (real numbers)

Full details: `~/homeops/_bmad-output/spikes/personalized-fleet/spike-notes.md`.
Sample packs: `~/homeops/_bmad-output/spikes/personalized-fleet/sample_packs/`.

**Models verified present in corpus** (4 service manuals, all with born-digital text):
LG WM3700HWA washer, Bosch 800 Plus dishwasher, Whirlpool LEW0050PQ dryer, Samsung
RF28R7201 fridge.

**Sample diagnostic pack sizes (real, extracted content):**

| Pack | raw | gzip-9 | zstd-19 | est. tokens |
|---|---|---|---|---|
| LG WM3700HWA | 6,264 B | 2,200 B | 2,164 B | ~1,565 |
| Bosch 800 Plus | 4,453 B | 1,653 B | 1,634 B | ~1,113 |
| Whirlpool LEW0050PQ | 3,189 B | 1,124 B | 1,126 B | ~797 |
| Samsung RF28R7201 | 5,342 B | 1,461 B | 1,447 B | ~1,335 |

**Fleet download footprint (packs only):** 3-appliance = **14.4 KB raw / 4.7 KB gzip /
~3,700 tokens**; 4-appliance = **18.8 KB raw / 6.3 KB gzip / ~4,810 tokens**.
*(Production full-extraction packs scale ~5–10× — still ~100–250 KB / ~40–80 KB
compressed / ≤60K tokens per fleet.)*

**Local retrieval latency (pack-scale index):** exact-match dict lookup **0.07 µs**
(5,000 records); SQLite FTS5 **4.18 µs**; fleet-scale lookup **0.06 µs**; single-pack
JSON parse **60 µs**. Naive linear scan (no index) is 126 ms — which is why packs ship
with an index, but the indexed path is effectively free.

**Diagnostic-worthy fraction:** only **1.5–6.7%** of each manual's text is
diagnostic-worthy; a pack is ~3 orders of magnitude smaller than its source PDF
(19 MB → 6 KB for LG).

**Verbatim spot-check (all confirmed in pdftotext output):**
LG `PE` pressure-sensor "21~23 ±10%", `LE` stator "5 to 15" ohm; Samsung freezer defrost
"63(230) ohm ± 7%" / flex damper "135 ohm"; Bosch "Error code E:15" + door-sensor
"13.5 V DC"; Whirlpool "Safety Thermostats".

---

## 9. Open Questions for Benjamin

| ID | Question | Context |
|---|---|---|
| **OQ-14** | **Adopt the pack+adapter architecture as the canonical Phase 2+ shape?** This reframes the SLM from "diagnostic expert + RAG" to "pack executor," and re-prioritizes Qwen3-small for T2 over Maple. | Changes the extraction plan's T1/T2 tiering and the model scorecard's pass criteria. |
| **OQ-15** | **Confirm T2 base = Qwen3 1.5B/3B (or Phi-4-mini), with Bonsai demoted to zero-shot spike only?** Bonsai's lack of LoRA support breaks the per-family adapter layer. | Depends on whether we accept "packs carry facts → small model suffices." |
| **OQ-16** | **Does the pack server redistribute *derived* records only (never raw manual text)?** This is the linchpin of the improved OQ-02 posture. | Legal review still gates fine-tuning; pack distribution is a separate, lower-risk surface. |
| **OQ-17** | **Top-50 vs top-100 family extraction target for Phase 2?** Top-50 covers the majority of households fastest; top-100 covers ~80–90% of scan events. | Trades extraction effort vs. scan-event coverage. |
| **OQ-18** | **On-device form factor still phone-only?** If yes, Maple (5.31 GB) is out for T2 and Qwen3-small (1–2 GB) is the phone path; if tablet/laptop is acceptable, Maple stays viable on-device too. | Same OQ-01 from v1.0, now sharper because the fleet model makes the small-model path *enough*. |
| **OQ-19** | **Synthetic households: do we invest in cross-appliance eval now (it's the unique fleet value-add), or defer to post-T1?** | Affects whether the training phase includes the §5.4 asset or ships the single-appliance path first. |

---

*HomeOps Personalized-Fleet Architecture v1.0 — Hermes — 2026-08-16*
*"The corpus is the raw material. The pack is the product. The model is the mouthpiece — and now the mouthpiece can be small."*
