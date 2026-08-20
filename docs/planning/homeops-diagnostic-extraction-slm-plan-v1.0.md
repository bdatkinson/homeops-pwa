# HomeOps — Diagnostic Step Extraction & SLM Path

**Version:** 1.0
**Date:** 2026-08-16
**Architect:** Hermes (successor to Winston's `homeops-corpus-data-prep-plan-v1.0.md`)
**Status:** Working Draft — feeds writing-plans + Kanban execution; assumes overlap analysis report (`~/homeops-corpus/analysis/corpus-overlap-2026-08-16.md`) lands first

> **Purpose:** Define the logical next step after corpus cleaning/structuring: (1) a first-class **diagnostic step extraction pipeline** that turns the deduplicated corpus into a structured Diagnostic Knowledge Model, and (2) a **runtime SLM strategy** — with an honest read on "TinyML" vs. Maple-Preview vs. other small models — that turns that knowledge into a deployable diagnostic assistant. This document is the successor to the v1.0 data-prep plan: it inherits P0/P1/P2 sequencing, upgrades P1-W2/W3 from side-quests to a pipeline, and replaces the spec-sheet model verdict with an empirical spike harness.

---

## Table of Contents

1. [Why This Is the Logical Next Step](#1-why-this-is-the-logical-next-step)
2. [Part A — Diagnostic Step Extraction Pipeline](#2-part-a--diagnostic-step-extraction-pipeline)
3. [Part B — SLM / TinyML Strategy](#3-part-b--slm--tinyml-strategy)
4. [Sequencing, Gates & Parallel Work Now](#4-sequencing-gates--parallel-work-now)
5. [Risks & Open Questions](#5-risks--open-questions)
6. [Appendix — Fresh Numbers & Model Landscape Refresh](#6-appendix--fresh-numbers--model-landscape-refresh)

---

## 1. Why This Is the Logical Next Step

The v1.0 data-prep plan correctly established: corpus is RAG-ready, NOT training-ready; hybrid RAG + small fine-tuned model is the recommended architecture; Maple-Preview is the primary model candidate with Bonsai as a spike. What v1.0 did **not** do:

1. **It treated extraction as a side-quest.** P1-W2 (error codes) and P1-W3 (symptom→fix) were two workstreams with loose JSON output. Extraction is actually the highest-leverage activity in the entire roadmap — it is the bridge that upgrades RAG from *chunk retrieval* to *record retrieval*, and it is the only source of licensing-clean training data (derived/synthesized, per OQ-02).
2. **It decided the model on spec sheets.** Maple-vs-Bonsai-vs-other was a paper comparison. Model choice should be empirical — measured on our eval set, our data shape, our latency budget.
3. **It predates the overlap analysis.** The corpus is now 3,650 PDFs / 16 GB (~35% larger than the 2,707/10 GB v1.0 was based on), and an overlap/dedup analysis is in flight. Dedup policy and extraction quality are coupled: extracting from 5 copies of the same manual wastes tokens and creates contradictory records.

**The thesis of this document:** the *structured diagnostic knowledge graph* is the moat. Raw PDFs are commodity — anyone can scrape them. A normalized, validated, deduplicated, safety-tagged diagnostic knowledge base across 48 brands is not. Every downstream asset (RAG, fine-tune, on-device model, technician handoff) is a consumer of this graph. So we build the extraction pipeline first, properly, and we let it feed the SLM decision.

---

## 2. Part A — Diagnostic Step Extraction Pipeline

### 2.1 What We Extract: The Diagnostic Knowledge Model (DKM)

A formal JSON schema — every record carries provenance (source doc, page, extraction method, confidence, license tag). Five record types:

| Record | Fields (core) | Source doc types |
|---|---|---|
| **ErrorCodeRecord** | code, meaning, likely_cause, action, model_scope[], brand, doc_id | service manuals, tech sheets |
| **SymptomRecord** | canonical_phrase, variant_phrases[], appliance_type, brand, model_scope[] | all troubleshooting content |
| **DiagnosticStep** | procedure_id, step_order, action, observation, expected_value, pass_branch, fail_branch, tools[], safety_level (1-4) | service manuals, flowcharts |
| **DiagnosticProcedure** | id, symptom_id, brand, model_scope[], steps[], entry_symptom, exit_conditions | troubleshooting sections, flowcharts |
| **FaultRecord** | root_cause, fix_action, parts_needed[], difficulty, safety_level, source_procedure_id | service manuals, repair content |

**Safety levels (hard gate):** 1 = user-safe consumer action, 2 = requires tool, 3 = requires power-off/qualified handling (gas, high-voltage, refrigerant), 4 = technician-only. **POLICY (OQ-22, 2026-08-16): all levels are viewable by consumers; steps at levels 3-4 display an explicit warning before execution** (encoded in the pack schema as `diagnosticStep.warning`).

**Why a schema matters:** it converts "troubleshooting prose" into executable decision trees that can be (a) retrieved exactly, (b) traversed by a small model without hallucination, (c) rendered as a technician diagnostic package, (d) verified round-trip against the source.

### 2.2 Three Extraction Channels (tiered by source structure)

| Channel | Source structure | Method | Precision | Cost / scale |
|---|---|---|---|---|
| **A — Tables** | Error-code tables, tech sheets, spec tables | `pdfplumber`/pymupdf table extraction + regex normalization | High (near-100% with validation) | Cheap, fully automatable |
| **B — Semi-structured prose** | Troubleshooting sections ("If X, check Y"), symptom→cause lists | Section detection (regex/TOC) + schema-constrained LLM extraction (JSON mode) | High with validation | Moderate (LLM batch, DeepSeek-class is fine) |
| **C — Flowcharts / diagrams** | Diagnostic flowcharts, decision trees, wiring-related procedures | LLM-assisted tree extraction + human review queue | Medium — requires QA | Highest effort; highest value (trees = runtime logic) |

**Channel C is the crown jewel.** Flowcharts ARE the decision trees a diagnostic assistant executes. v1.0 punted on them ("GPT-4o-mini with a prompt"). This plan gives them a dedicated queue with human review because they feed safety-critical runtime behavior.

### 2.3 Pipeline Stages

```
corpus (deduped, OCR'd, metadata'd — v1.0 P0/P1)
   │
   ▼
S1 SEGMENT   → split by doc type; locate error-code sections, troubleshooting sections,
               flowchart pages, tech-sheet tables (regex + TOC heuristics + LLM section map)
   │
   ▼
S2 EXTRACT   → Channel A (tables) / Channel B (prose) / Channel C (flowcharts)
               → emit DKM records with provenance + confidence
   │
   ▼
S3 NORMALIZE → canonical symptom phrases, unit/measurement standardization,
               model-number normalization, brand-alias resolution
   │
   ▼
S4 DEDUP     → KNOWLEDGE-level dedup (not text-level): same error code + same model scope
               across docs → merge, flag conflicts. This is the overlap analysis applied
               to knowledge instead of bytes.
   │
   ▼
S5 VALIDATE  → round-trip check (record must be answerable from source text),
               cross-doc consistency, safety-level audit, conflict report
   │
   ▼
S6 STORE     → Supabase tables (error_codes, symptoms, diagnostic_steps, procedures,
               faults) + license manifest link + review-queue table
```

**Validation is not optional.** Round-trip validation (S5) is the anti-hallucination mechanism *at the data layer*: a DiagnosticStep that can't be grounded in its source is discarded, not trained on.

### 2.4 Knowledge-Level Dedup (the overlap analysis, applied)

The in-flight overlap report measures *text* overlap. Extraction must measure *knowledge* overlap:

- Same error code (e.g., LG `OE`) appearing in 6 different manuals → one canonical record with model_scope = union, sources = 6. Conflicts (different meanings for same code) → flag for review, never silently merge.
- Same procedure ("test drain pump resistance, expect 8-20Ω") across brands → canonicalize with brand-specific expected values preserved.
- Same symptom ("won't drain") across 200 docs → one SymptomRecord with variants; procedures attached per brand/model.

This is where the corpus stops being "many manuals" and becomes "one knowledge base."

### 2.5 Storage & Consumption

- **Runtime RAG:** retrieve DKM records, not raw chunks. Error codes via exact match; symptoms via embedding. This alone fixes the boilerplate-retrieval problem the overlap analysis will quantify.
- **Training data:** instruction pairs synthesized FROM validated DKM records (v1.0 P2-W1/W2/W3) — satisfies the OQ-02 licensing posture (derived data, traceable provenance).
- **API:** the gateway serves structured diagnostic packages directly from the graph for technician handoff — no model needed for the structured path.

---

## 3. Part B — SLM / TinyML Strategy

### 3.1 The Honest "TinyML" Reality Check

**"TinyML" in the literal sense — microcontroller-class (KB of RAM, ESP32/Pico-class) — cannot run a useful text-generating LLM in 2026.** Anyone promising appliance diagnostics on a $5 MCU is selling vaporware; LLM generation needs at minimum hundreds of MB of weights and GB-scale RAM for a usable context.

**"TinyML" in the practical sense — a model small enough to run on-device (phone/tablet/edge box) — is real and is exactly what HomeOps Phase 2+ needs.** The realistic envelope: **1–6 GB** of model weights, i.e. 0.5B–4B dense or 8–20B MoE/ternary. The strategy below targets that envelope and is explicit about the device classes.

### 3.2 Runtime Tiers (deploy the same knowledge at three sizes)

| Tier | Device | Model class | Privacy | When |
|---|---|---|---|---|
| **T0 — Cloud RAG + API LLM** | Any | Current cloud (claude-haiku / DeepSeek) + DKM retrieval | Cloud | Phase 1 — shipping now; improved immediately by DKM |
| **T1 — Served SLM** | Server / Mac mini / edge box | Fine-tuned **Maple-Preview 20B-A1B** (5.31 GB, 1B active → CPU-feasible, 200+ tok/s on M4) or Bonsai 8B ternary (1.75 GB) | Per-user or on-prem | Phase 2 — default privacy path |
| **T2 — On-device** | Phone / tablet | **Bonsai 8B ternary** (1.75 GB, 44 tok/s iPhone 17 Pro Max) if Bankai spike succeeds; else distilled **Qwen 1.5B / Phi-4-mini / Gemma 3n** (0.6–4 GB) | Fully local, offline | Phase 3 — privacy default per Trust Constitution |

**Key architectural shift vs. v1.0:** the SLM's job changes from "diagnostic expert that happens to RAG" to **"conversational front-end + decision-tree executor over the DKM."** The knowledge lives in the structured graph (retrieved exactly); the model's job is dialogue, safety gating, and step traversal. This dramatically lowers the fine-tuning burden and the hallucination surface — the model is not asked to *remember* error codes, it's asked to *execute* retrieved ones.

### 3.3 Candidate Refresh (v1.0 had 2; the field is bigger)

| Model | Size / footprint | License | Tuning path | Fit |
|---|---|---|---|---|
| **Maple-Preview** (DeepGrove) | 20B-A1B / 5.31 GB, 131K ctx | MIT | Standard LoRA/QLoRA | ✅ Primary T1 candidate (unchanged) |
| **Bonsai 8B ternary** (PrismML) | 8.2B / 1.75 GB | Apache 2.0 | **Bankai XOR patches only** (young) | ⚠️ T2 phone path — spike first |
| **Qwen 1.5B–4B** (Qwen3 line) | 1–4 GB | Apache 2.0 | Standard LoRA, battle-tested | ✅ Strong T2 fallback — cheapest proven path |
| **Phi-4-mini** (Microsoft) | 3.8B | MIT | Standard LoRA | ✅ T2 contender |
| **Gemma 3n** (Google) | 1–4B, on-device-optimized | Gemma license | Standard LoRA, TFLite/GGUF support | ⚠️ License review (Gemma terms) |
| **Granite 3.2 / Llama 3.2-tiny** (IBM/Meta) | 1–3B | Apache 2.0 / Llama license | Standard LoRA | ⚠️ Llama license review |

**Decision rule: no more paper decisions.** The spike harness (below) picks the model.

### 3.4 The SLM Spike Harness (runs NOW, before any training spend)

Zero-shot / few-shot prompt each candidate with the DKM schema + 3 representative diagnostics, and measure on the 200-question eval set (v1.0 P1-W5):

1. **Diagnostic accuracy** — correct error-code meaning, correct step ordering, correct branch decision
2. **Schema conformance** — % valid DKM JSON output
3. **Safety behavior** — 50 dangerous scenarios → zero wrong answers (hard gate)
4. **Latency & footprint** — tok/s and GB on target hardware class (M4, iPhone-class, edge CPU)
5. **Tuning feasibility** — LoRA works? Bankai works? (Bonsai spike = 100 pairs, per v1.0)

Output: a **model scorecard** and a tier assignment (T1/T2), decided by data, not spec sheets. Candidates cost nothing to run off-the-shelf (GGUF + llama.cpp) — this is the cheapest de-risking step in the whole roadmap.

### 3.5 Fine-Tuning Data = Validated DKM Records (licensing-clean by construction)

- Instruction pairs are synthesized from **validated** DKM records only (v1.0 P2-W1/W2/W3, now grounded in the graph).
- Every training example traceable to a source doc + license tag (v1.0 P0-W5 manifest).
- Safety-stop and out-of-scope pairs (v1.0 P2-W3) remain hard gates in run #1.
- Fine-tune Maple-Preview via LoRA/QLoRA (4-8 hrs on a single GPU per v1.0); T2 distill/quantize to GGUF 4-bit (~2.5 GB) or the chosen small model.

---

## 4. Sequencing, Gates & Parallel Work Now

### 4.1 Order of Operations

```
NOW (parallel, no dependencies):
├── Overlap analysis finishes → dedup policy + canonical-doc selection   [in flight]
├── DKM schema v1 drafted + reviewed                                       [2 hrs]
├── SLM spike harness (zero-shot, off-the-shelf models, 200Q eval set)     [6 hrs — runnable TODAY without extraction]
└── Eval set build (v1.0 P1-W5: 200Q held-out)                             [6 hrs]

WEEK 1-2: EXTRACTION PILOT (prove the pipeline on a slice)
├── S1-S2 on 1 brand family (e.g. Whirlpool) + all tech sheets (~50 docs)
├── Channel A (tables) fully automated; Channel B LLM-assisted; Channel C pilot with 20 flowcharts
├── S3-S5 normalization + validation harness
└── GATE: ≥80% of records pass round-trip validation; safety levels audited

WEEK 3-5: EXTRACTION SCALE + KNOWLEDGE DEDUP
├── S1-S6 across full deduped corpus (all 48 brands)
├── Knowledge-level dedup (S4) → canonical records + conflict report
├── Supabase DKM tables populated; gateway read path
└── GATE: error codes ≥80% of service manuals; conflict rate <5%

WEEK 5-7: SLM TRAINING + EVAL (data from validated DKM only)
├── Instruction-pair synthesis (v1.0 P2-W1/W2/W3) on validated records
├── Fine-tune Maple-Preview (T1); Bonsai Bankai spike (T2) in parallel if spike harness passes
├── Re-run eval set; zero DANGEROUS ratings; accuracy ≥85% codes / ≥75% symptoms
└── GATE: model scorecard + tier assignment signed off

WEEK 8+: DEPLOY
├── T1 served SLM behind gateway (structured package + dialogue)
├── T2 on-device build (GGUF / TFLite) for phone offline mode
└── Continuous: extraction pipeline re-runs on corpus growth (cron hooks)
```

### 4.2 Hard Gates (no skipping)

1. **Overlap report → dedup policy applied** before extraction scale (garbage in → garbage records).
2. **Round-trip validation ≥80%** before any record enters training data.
3. **OQ-02 licensing sign-off** (derived-data posture) before any fine-tune.
4. **Zero DANGEROUS ratings** on 50 safety scenarios — in the spike harness AND after fine-tune.
5. **Model scorecard** (not spec sheets) before committing primary T1/T2.

### 4.3 What Can Start TODAY (no dependencies)

- DKM schema draft (this doc's §2.1 is the seed)
- Eval set build (200Q — v1.0 P1-W5 spec is complete)
- **SLM zero-shot spike harness** — needs no extraction, no training, no licensing: download GGUF of Maple-Preview, Bonsai ternary, Qwen 1.5B/3B, Phi-4-mini, Gemma 3n; run the 200Q eval; produce the scorecard. ~6 hours of mostly-unattended compute.

---

## 5. Risks & Open Questions

### 5.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Extraction quality on scanned/flowchart docs** | Medium | High — garbage knowledge → garbage model | Channel C human review queue; round-trip validation gate; prioritize born-digital for training |
| **Knowledge conflicts across brands** (same code, different meaning) | High | Medium | S4 conflict report; never silently merge; review queue |
| **Bonsai/Bankai tuning immature** | High | Medium | Spike harness decides; Qwen/Phi fallback is proven |
| **Maple-Preview 5.31 GB too big for phone** | Medium | Medium | T2 = separate small model (distill/quantize); Maple serves T1 |
| **Licensing (OQ-02)** | Medium | High | Train only on derived/validated records; legal review gate |
| **Overlap report shows more dupes than expected** | Medium | Low-Med | Dedup policy absorbs; knowledge dedup handles the rest |

### 5.2 Open Questions (for Benjamin)

| ID | Question | Context |
|---|---|---|
| **OQ-09** | Confirm **DKM is the source of truth** for runtime (vs. raw-chunk RAG)? This changes gateway retrieval design now. | Depends on whether we ship T0 improvements before extraction finishes. |
| **OQ-10** | **Safety-level policy** — ✅ RESOLVED (OQ-22, 2026-08-16): all levels viewable; warnings required for levels 3-4. | Consumers CAN see level-3/4 steps with explicit `warning` text; extraction must populate `warning` for every step ≥ level 3. |
| **OQ-11** | **Budget for the spike harness** — a single A100/hosted GPU run of 5 models × 200Q ≈ $10-30, or free on local M-series? | Local is free but slower; decides scheduling. |
| **OQ-12** | Who reviews **Channel C flowcharts** and conflict reports — certified tech (OQ-07) or founder + AI agents with spot checks? | QA capacity is the extraction bottleneck. |
| **OQ-13** | Is **technician diagnostic-package-as-API** (structured, no model) a v1 feature, or strictly Phase 2? | The DKM makes it nearly free; affects gateway scope now. |

---

## 6. Appendix — Fresh Numbers & Model Landscape Refresh

- **Corpus now:** 3,650 PDFs / 16 GB / 48 manufacturers (up from 2,707/10 GB at v1.0). Live counts from auto-regenerated coverage reports.
- **Overlap analysis:** in flight (deleg_42d7f0f5) → `~/homeops-corpus/analysis/corpus-overlap-2026-08-16.md`. Will supply exact-dup %, near-dup clusters, boilerplate stats — inputs to the dedup policy and S4 knowledge dedup.
- **v1.0 stale numbers to refresh post-overlap:** 210 MD5 duplicate groups (~7.7%) was on 2,709 PDFs; expect the absolute number to rise with 3,650 files.
- **Model landscape (verified 2026-08-16):** Maple-Preview (DeepGrove, MIT, 20B-A1B, 5.31 GB, 131K ctx, 200+ tok/s M4) and Bonsai 8B (PrismML, Apache 2.0, 1-bit 1.15 GB / ternary 1.75 GB, Qwen3-based, Bankai XOR tuning) both confirmed live. Newer cheap-proven fallbacks (Qwen3 small, Phi-4-mini, Gemma 3n) widen the T2 envelope since v1.0.

---

*HomeOps Diagnostic Step Extraction & SLM Plan v1.0 — Hermes — 2026-08-16*
*"The corpus is the raw material. The knowledge graph is the product. The small model is just the mouthpiece."*
