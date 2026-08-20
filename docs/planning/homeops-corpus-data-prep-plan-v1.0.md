# HomeOps — Corpus Data-Prep Architecture for Small-Model Training/Fine-Tuning

**Version:** 1.0
**Date:** 2026-08-09
**Architect:** Winston (BMAD System Architect)
**Status:** Working Draft — Feeds writing-plans + Kanban execution

> **Purpose:** Produce the data-preparation and improvement architecture needed BEFORE training or fine-tuning a small domain model to power: (1) a consumer voice/text appliance troubleshooting guide, and (2) a structured diagnostic package handoff for a service technician. This document is prescriptive, prioritized, and concrete — every task is bite-sized and toolable.

---

## Table of Contents

1. [Executive Summary — The Data-Prep Thesis](#1-executive-summary)
2. [Training Architecture Decision](#2-training-architecture-decision)
3. [Corpus Audit Findings](#3-corpus-audit-findings)
4. [Data Prep Workstreams (P0 / P1 / P2)](#4-data-prep-workstreams)
5. [Remaining Document Acquisition Priorities](#5-remaining-document-acquisition-priorities)
6. [Sequencing & Effort](#6-sequencing--effort)
7. [Risks & Open Questions](#7-risks--open-questions)
8. [Appendix — Model Research Notes](#8-appendix-model-research-notes)

---

## 1. Executive Summary — The Data-Prep Thesis

### 1.1 What We're Building

Two distinct outputs from the same underlying corpus knowledge:

| Output | User | Format | Content Need |
|--------|------|--------|-------------|
| **Troubleshooting Guide** | Consumer (homeowner/renter) | Multi-turn voice/text dialogue | Symptom → safe diagnostic steps → confidence-scored likely cause → when to call a pro |
| **Diagnostic Package** | Service technician | Structured handoff document | Symptom history, observed evidence, error codes, appliance model/serial, likely causes ranked, recommended repair actions, parts references |

### 1.2 The Core Thesis

**The corpus has excellent brand breadth (~97% of CR-reviewed brands covered) but structurally insufficient depth for either training or fine-tuning a model that must speak fluently about specific appliance diagnostics.**

The 2,707 PDFs (~10 GB) are a strong retrieval corpus for RAG. They are NOT — in their current state — a training corpus. The difference is structural:

- **RAG needs:** Chunked text, vectorized, model-filtered at query time. Raw PDF → chunk → embed is sufficient.
- **Training needs:** Structured, deduplicated, instruction-formatted, QA-paired, error-code-enumerated, hallucination-guarded, quality-scored data. Raw PDFs mixed with scanned images, stubs, HTML redirects, duplicates, and consumer warranty fluff produce a noisy training signal.

**Thesis:** The highest-ROI path is a **hybrid architecture**: **(1) RAG over the vectorized corpus for recall-grounded factual retrieval** (error codes, specs, parts, wiring references), married to **(2) a small fine-tuned model for the conversational/diagnostic format and structured handoff output**. The fine-tuning data must be derived from the corpus — but the raw corpus is not the fine-tuning data. A deliberate, multi-pass data preparation pipeline is needed to turn 2,707 PDFs into instruction-tuning pairs, diagnostic decision trees, and structured handoff templates.

### 1.3 Why Not Just Prompt the Cloud LLM?

The HomeOps PRD (v1.0 § 7B) correctly targets `claude-3-5-haiku` via cloud API for Phase 1. That is the right call for shipping quickly — the end-to-end RAG pipeline exists, latency is acceptable for a text-first consumer app, and the $0.002/session cost is negligible. The fine-tuned small model is the **Phase 2+ privacy path** (Trust Constitution Rule 14: on-device diagnostic is the default privacy path, not a premium feature). The data-prep work described here unblocks the on-device path and also improves the cloud RAG pipeline by making the retrieval corpus cleaner, more structured, and more evaluable.

---

## 2. Training Architecture Decision

### 2.1 The Three Options

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **A: Pure RAG** | Retrieve chunks from vector DB → feed to cloud LLM or small model | Zero training cost. Works with any model. Citations. | Cloud-dependent (unless paired with small model). No conversational flow learned — every turn is a fresh retrieval. | **Phase 1 baseline. Works now.** |
| **B: Pure Fine-Tune** | Train a small model on instruction pairs derived from corpus | On-device capable. Low latency. Conversational flow baked in. | Hallucination risk for model numbers/error codes. No citation trail. Cannot update without retraining. | **Too risky alone for Phase 2.** |
| **C: Hybrid (RAG + Fine-Tune)** | RAG for factual recall + fine-tuned small model for dialogue format and structured output | On-device capable. Citations from RAG. Conversational ease from fine-tune. Hallucination can be detected by cross-referencing RAG chunks. | More complex pipeline. Both systems must be maintained. | **✅ Recommended for Phase 2.** |

### 2.2 Recommended Architecture: Hybrid for Phase 2

```
USER INPUT ("my washer won't spin, makes a grinding noise")
         │
         ▼
┌─────────────────────────────────────┐
│  ON-DEVICE FINE-TUNED MODEL          │
│  (Bonsai 8B or Maple-Preview)        │
│  Role: Conversational guide +        │
│  safety gate + structured output     │
│                                      │
│  1. Classifies symptom → category    │
│  2. Generates clarifying questions   │
│  3. Safety pre-check (gas? water+    │
│     electrical?) → immediate stop    │
│  4. Calls RAG for factual lookup     │
└──────────┬──────────────────────────┘
           │
    ┌──────▼──────┐
    │  LOCAL RAG   │  (pgvector subset, compressed — top 50K chunks for target appliance)
    │  Fact lookup │
    │  Error codes │
    │  Part #s     │
    └──────┬──────┘
           │
           ▼
┌─────────────────────────────────────┐
│  STRUCTURED OUTPUT                   │
│  {                                   │
│    likely_cause: "...",              │
│    confidence: 0.82,                 │
│    safe_steps: [...],                │
│    diagnostic_package: {             │
│      appliance: {...},               │
│      symptoms: [...],                │
│      error_codes: [...],             │
│      recommended_actions: [...],     │
│      parts_reference: [...],         │
│      safety_flags: [...]             │
│    }                                 │
│  }                                   │
└─────────────────────────────────────┘
```

### 2.3 Candidate Model Assessment

#### Bonsai 8B / Ternary Bonsai 8B (PrismML)

**What it is:** A true 1-bit (or ternary 1.58-bit) 8.2B-parameter model. 1.15 GB (1-bit) / 1.75 GB (ternary). Apache 2.0 license. Qwen3-based architecture (36 layers, 4096 hidden dim, GQA 32/8 heads).

**Benchmarks (ternary variant):** Average 75.5 across MMLU Redux, MuSR, GSM8K, HumanEval+, IFEval, BFCLv3. Competitive with full-precision 8B models.

**Fine-tuning story:**
- Standard LoRA does NOT work — it's a float-space adaptation for a 1-bit model.
- **Bankai** (open-source, April 2026): XOR-patch adaptation method. Kilobyte-scale patches that flip specific weight rows. Validated on Bonsai 8B specifically. This is the only known fine-tuning path.
- Bankai demonstrates domain adaptation (math, coding) but at small scale — the method is young.
- Requires PrismML's custom fork of `mlx` and `llama.cpp` for inference.

**Fit for HomeOps:** ⚠️ **Promising but constrained.** The 1.15–1.75 GB footprint is ideal for on-device. The Bankai adaptation path exists but is immature — no published evidence of multi-turn dialogue fine-tuning at scale. The Qwen3 base means it inherits Chinese+English pretraining, potentially weaker on English-only domain tasks. **Recommendation: Spike Bankai fine-tuning on a small appliance QA dataset (100 pairs) to evaluate feasibility before committing.**

#### Maple-Preview (DeepGrove)

**What it is:** 20B-A1B ternary-weight MoE reasoning model. 5.31 GB checkpoint. MIT license. 24 layers, 256 experts (8 active), 3:1 SWA-512:GA attention. 131,072 token context.

**Benchmarks:** SOTA reasoning for its weight class — competitive with full-precision models on LCBv6, AIME 2026, HMMT 2026, GPQA-D. 200+ tok/s on M4 Mac mini.

**Fine-tuning story:**
- Standard architecture (ternary weights, but conventional layer structure) — likely supports LoRA/QLoRA via standard frameworks (Transformers, Axolotl, Unsloth). No exotic patch format required.
- MIT license — no restrictions on fine-tuning or commercial use.
- Caveat: "minimal post-training for agentic domains and only small-scale general RL." The model is strong at reasoning but may need substantial instruction-tuning for multi-turn dialogue.
- The 131K context window is a practical advantage — it can hold multiple manual chunks in context without truncation.

**Fit for HomeOps:** ✅ **Stronger candidate.** The 5.31 GB footprint is larger (may be tight for on-device on phones but fits comfortably on laptops/M-series Macs). The conventional architecture means standard fine-tuning tooling works. The reasoning strength directly benefits diagnostic decision-tree traversal. The MIT license is clean. **Recommendation: Primary candidate. Fine-tune via LoRA/QLoRA on structured appliance diagnostic data.**

#### Verdict

| Criterion | Bonsai 8B (Ternary) | Maple-Preview | Notes |
|-----------|---------------------|---------------|-------|
| On-device fit (phone) | ✅ 1.75 GB | ⚠️ 5.31 GB | Bonsai wins for phone; Maple better for tablet/laptop |
| Fine-tuning tooling | ⚠️ Bankai only (young) | ✅ Standard LoRA/QLoRA | Maple wins decisively |
| Reasoning quality | 75.5 avg | SOTA in class | Maple wins |
| License | Apache 2.0 | MIT | Both clean |
| Context window | Unknown (likely 32K-128K) | 131,072 | Maple advantage for RAG context |
| **Recommendation** | Spike only | **Primary candidate** | Evaluate Bonsai via Bankai spike; start with Maple |

---

## 3. Corpus Audit Findings

### 3.1 The Good

- **Brand breadth is excellent.** 97% of CR-reviewed (category, brand) pairs have at least one PDF. 48 distinct manufacturers. All four top Phase 1 categories (dishwasher, washer, dryer, refrigerator) have Tier-1 brand coverage.
- **Document type mix is functional.** 1,430 user manuals + 596 service manuals + 291 installation guides. The service manual count has grown substantially from earlier estimates.
- **Corpus infrastructure exists.** Supabase model_registry (7,849 rows), OCR pipeline validated (Tesseract), pgvector 0.8.1 + Postgres 18, walk-through-scan edge function, CPSC recall integration.
- **Continuous acquisition pipeline.** The `HomeOps PDF Scraper` cron runs every 15 minutes, auto-generating coverage reports. This is a living corpus, not a static snapshot.

### 3.2 The Bad — Structural Problems Requiring Remediation

#### 3.2.1 Duplicates

**Finding:** `md5sum` analysis on 2,709 PDFs reveals **210 MD5 groups with duplicate hashes** (i.e., at least 210 files are byte-identical to another file under a different name). This is ~7.7% of the corpus.

**Impact on training:** Duplicates inflate token counts, bias the model toward repeated content, and waste embedding budget. They also corrupt eval — a "held-out" test chunk might appear in training via a duplicate filename.

**Actions:** P0 dedup pass using MD5 + MinHash LSH for near-duplicates (see §4.1.1).

#### 3.2.2 OCR Quality / Scanned PDFs

**Finding:** Spot check on first 100 PDFs: at least 1 PDF (A.O. Smith water heater service handbook) has <100 characters of extractable text — effectively a scanned image with no text layer. The Bosch 800-series dishwasher service manual yields only 1,446 chars, suggesting heavy image/scan content. Service manuals pre-2000 are frequently scanned-only (no born-digital text layer).

**Impact on training:** Scanned PDFs with no text layer produce zero training data without OCR. Even with OCR, Tesseract output on technical diagrams + mixed layouts is error-prone (model numbers become garbled, error codes misread).

**Actions:** P0 OCR pass for all PDFs with <500 chars extractable text. Use `marker-pdf` (Nougat-based, better for technical docs than Tesseract alone) as primary, Tesseract as fallback. Flag any PDF where OCR confidence is <80% for human review.

#### 3.2.3 Stub PDFs / HTML Error Pages

**Finding:** The corpus skill documents known stub patterns: service.subzero.com returns single-page excerpts (~50-80KB) that LOOK like real PDFs (pass header check, have extractable text) but are 1-page stubs. HTML error pages (start with `<!DOC`) have been caught by the cron pipeline but may still exist.

**Impact:** Stubs pollute training data with truncated, misleading content. A 1-page "service manual" that's actually a cover page will teach the model that service manuals are 1-page documents.

**Actions:** P0 stub removal: flag all PDFs with <3 pages or <100KB as candidates for deletion/replacement. Verify via `pdfinfo | grep Pages` and `head -c 4` (magic byte check).

#### 3.2.4 Filename Inconsistency

**Finding:** Filenames follow a rough `Brand-Category-DocType[-details].pdf` convention but with inconsistencies: capitalization varies (BradfordWhite vs bradfordwhite), compound brands exist (Maytag-Amana, Whirlpool-KitchenAid), doc-type labeling is unreliable (the Wolf "owner's manual" is actually a parts list).

**Impact:** Programmatic metadata extraction from filenames is brittle. Training data construction needs reliable brand/model/category/doc-type tags.

**Actions:** P0 filename normalization pass + metadata enrichment (see §4.2.1).

#### 3.2.5 Missing Model Depth

**Finding:** The corpus covers ~5-15% of the 70,400 US model numbers. CR reviews ~700 kitchen appliances at model level. The corpus has brand breadth but not model depth — we can talk ABOUT a Whirlpool dishwasher generically but not answer model-specific questions for most sub-models.

**Impact:** A fine-tuned model will be fluent but vague — "check the drain pump" vs. "on model WDT780SAEM1, error code F8E1 indicates water overflow; test the inlet valve resistance (should be 860Ω ±10%)." The second answer requires model-specific data.

**Actions:** P1 model-depth acquisition focusing on top CR-rated models + most common error codes (see §5).

### 3.3 The Ugly — Doc-Type Mix Implications

The corpus content landscape skill reveals a critical structural finding: **service manuals OMIT consumer routine-ops and maintenance content.** They are complementary, not supersets. A model trained only on service manual text would:
- Know how to test a thermistor but not how to clean a condenser filter
- Know error code meanings but not warranty terms
- Know wiring diagrams but not energy-saving tips

For the consumer troubleshooting output, we need BOTH. For the technician diagnostic package, the service manual content is sufficient but needs to be extracted differently (structured error-code tables, not prose chunks).

**Implication for data construction:** Training data must DRAW FROM BOTH document types, and the prompt instructs which perspective to adopt (consumer-appropriate vs. technician-technical).

---

## 4. Data Prep Workstreams (Prioritized P0 / P1 / P2)

### 4.1 P0 — Cleaning & Validation (Must Complete Before Any Training)

> **Goal:** Transform a raw PDF pile into a clean, deduplicated, text-extractable, metadata-tagged document set. Blocking for both RAG quality and training data construction.

#### 4.1.1 P0-W1: MD5 Dedup Pass

| Item | Detail |
|------|--------|
| **Goal** | Eliminate byte-identical duplicates. |
| **Actions** | 1. Run `md5sum *.pdf \| sort \| uniq -d` to find duplicate hash groups. 2. For each group, keep the file with the most descriptive (longest) filename. 3. Delete the rest. 4. Record all deletions in a manifest (`~/homeops-corpus/analysis/dedup-manifest-YYYY-MM-DD.csv`) for audit. |
| **Tooling** | Terminal one-liner + Python dedup script in `~/homeops-corpus/pipeline/dedup.py` (already spec'd in corpus build plan §6.4). |
| **Acceptance criteria** | Zero `md5sum` collisions remain. Corpus size reduction ~7-8% (from 2,709 → ~2,500 PDFs). |
| **Notes** | The existing `pipeline/dedup.py` spec includes MinHash LSH for near-duplicates — run this AFTER exact dedup to catch 95%+ similar PDFs (same manual, different compression). |

#### 4.1.2 P0-W2: Stub & HTML Removal

| Item | Detail |
|------|--------|
| **Goal** | Remove stub PDFs, HTML error pages, and corrupt files. |
| **Actions** | 1. Run `pdfinfo` on all PDFs; flag any with Pages < 3. 2. Run `head -c 4` magic-byte check (must be `%PDF`). 3. Run `pdftotext \| head -c 100` and flag any starting with `<!DOC`, `<html`, or empty. 4. For stubs <100KB from service.subzero.com: check if a full version exists elsewhere (the KnowledgeBase/DownloadSectionExternal workaround). 5. Delete verified stubs/errors; replace where possible. |
| **Tooling** | `~/homeops-corpus/pipeline/validate.py` (new — wraps pdfinfo + pdftotext checks). |
| **Acceptance criteria** | Zero non-PDFs. Zero 1-2 page stubs. Every remaining PDF has ≥3 pages AND ≥500 chars extractable text OR is flagged for OCR. |

#### 4.1.3 P0-W3: OCR for Scanned PDFs

| Item | Detail |
|------|--------|
| **Goal** | Give every PDF a usable text layer. |
| **Actions** | 1. Identify all PDFs with <500 chars extractable text via `pdftotext`. 2. Run `marker-pdf` (Nougat-based, open-source) on each — handles technical docs better than Tesseract alone. 3. Fall back to Tesseract + pdf2image for PDFs that marker-pdf fails on. 4. Store OCR'd text as `.txt` sidecar alongside the original PDF (do NOT modify the original — retain provenance). 5. Flag any PDF that still has <200 chars after OCR for manual review. |
| **Tooling** | `marker_single` from the `marker-pdf` package. Existing Tesseract pipeline validated at `/home/batkinson/extract_model.py`. |
| **Acceptance criteria** | ≥95% of PDFs have ≥500 chars extractable text (native or OCR). Remaining <5% are flagged for replacement. |
| **Effort** | ~2-4 hours for batch processing. `marker-pdf` is GPU-accelerated if available; CPU fallback is slower but functional. |

#### 4.1.4 P0-W4: Filename Normalization

| Item | Detail |
|------|--------|
| **Goal** | Consistent, machine-parseable filenames. |
| **Actions** | 1. Define canonical brand list from the 48 known manufacturers. 2. Normalize: lowercase, hyphens as separators, resolve compound brands to primary (Maytag-Amana → Maytag, with Amana tagged). 3. Enforce schema: `{brand}-{category}-{doctype}[-{detail}].pdf`. 4. Extract metadata from normalized filenames into a JSON manifest. 5. Rename files in-place OR create symlinks with normalized names (less destructive — preserves original names for provenance). |
| **Tooling** | `~/homeops-corpus/pipeline/normalize.py` (new). |
| **Acceptance criteria** | Every PDF filename matches `{brand}-{category}-{doctype}[-{detail}].pdf`. Brand list is canonical (no case variants). Doc-type is verified by content, not just filename (cross-reference quality scoring). |

### 4.2 P1 — Structuring & Enrichment

> **Goal:** Add structured metadata to every document — brand, model number range, category, doc type, error codes. This is the bridge from "pile of PDFs" to "training data."

#### 4.2.1 P1-W1: Per-Document Metadata Extraction

| Item | Detail |
|------|--------|
| **Goal** | Every document gets a structured metadata record: brand, model(s), category, doc type, year range, page count, quality score. |
| **Actions** | 1. Extract brand/model from filename AND first 5 pages of text (regex for known model number patterns: Whirlpool `W[A-Z]{2}\\d{4}[A-Z]*`, GE `G[A-Z]{2}\\d{2}[A-Z]*`, LG `[A-Z]{2}\\d{4}[A-Z]*`, Samsung `[A-Z]{2}\\d{2}[A-Z]\\d{4}`). 2. Cross-reference extracted models against `model_registry` in Supabase (7,849 rows). 3. Score quality using the `pipeline/quality.py` signals from corpus build plan §6.5. 4. Write metadata to `~/homeops-corpus/metadata/documents.jsonl`. |
| **Tooling** | `~/homeops-corpus/pipeline/extract.py` (PDF text) + `~/homeops-corpus/pipeline/metadata.py` (new — regex model extraction + Supabase lookup). |
| **Acceptance criteria** | Metadata record for 100% of PDFs. Model number extracted for ≥70% of documents. Quality score assigned for 100%. |

#### 4.2.2 P1-W2: Error-Code Table Extraction

| Item | Detail |
|------|--------|
| **Goal** | Extract error/fault code tables from service manuals as structured records. |
| **Actions** | 1. For every service manual (596 documents), search for error code sections (regex: `error codes?|fault codes?|diagnostic codes?|troubleshooting codes?`). 2. Extract tables using `pdfplumber.extract_tables()`. 3. Parse each row into `{code, meaning, likely_cause, action}`. 4. Where tables are image-only (scanned), use LLM-assisted extraction (GPT-4o-mini, batch mode, ~$0.15/1M input tokens — cheap at this scale). 5. Store in `error_codes` table (new Supabase table) or JSONL file. |
| **Tooling** | `pdfplumber` for table extraction. `~/homeops-corpus/pipeline/extract_errors.py` (new). |
| **Acceptance criteria** | Error codes extracted for ≥80% of service manuals. Each record has code + meaning + action. Cross-referenced with brand/model. |
| **Why this matters** | Error-code lookup is the #1 diagnostic use case. "What does F8E1 mean?" must be answerable with precision. Structured error codes also enable exact-match retrieval (no embedding ambiguity). |

#### 4.2.3 P1-W3: Symptom → Cause → Fix Extraction

| Item | Detail |
|------|--------|
| **Goal** | Extract diagnostic decision trees and troubleshooting flowcharts as structured data. |
| **Actions** | 1. Identify troubleshooting sections in service manuals (regex: `troubleshooting|diagnostic|problem.*solution|symptom.*cause`). 2. For prose-style troubleshooting: parse problem/solution pairs. 3. For flowchart-style: LLM-assisted extraction — send flowchart section text to GPT-4o-mini with prompt "Extract the decision tree: for each symptom, list the branches (check X → if yes → Y, if no → Z)". 4. Store as structured JSON: `{symptom, possible_causes: [{cause, checks: [...], fix, parts_needed}], safety_warnings}`. |
| **Tooling** | `pdfplumber` for text, GPT-4o-mini for flowchart interpretation. `~/homeops-corpus/pipeline/extract_symptoms.py` (new). |
| **Acceptance criteria** | Symptom→fix pairs extracted for ≥60% of service manuals. Each pair has at least 1 check step and 1 recommended action. |

#### 4.2.4 P1-W4: Diagnostic Package Template Construction

| Item | Detail |
|------|--------|
| **Goal** | Define and populate the structured diagnostic handoff format. |
| **Actions** | 1. Define JSON schema for diagnostic package (see architecture §5.2.4). 2. Create template population rules: which fields come from user input (symptoms), which from corpus (error code meanings, likely causes, parts), which from model inference (confidence, recommended action). 3. Build 50 example diagnostic packages from real service manual scenarios (manually curated — use the three verified pairs from corpus-content-landscape.md as starters). |
| **Tooling** | Schema definition + `~/homeops-corpus/pipeline/diagnostic_template.py` (new). |
| **Acceptance criteria** | JSON schema finalized. 50 handcrafted examples. Template population logic specified. |

### 4.3 P2 — Training-Data Construction

> **Goal:** Produce instruction-tuning datasets for the small model fine-tune. This is the highest-value, highest-effort workstream.

#### 4.3.1 P2-W1: Instruction Tuning Pairs — Consumer Troubleshooting

| Item | Detail |
|------|--------|
| **Goal** | Produce 5,000–10,000 instruction-tuning pairs for the consumer troubleshooting dialogue. |
| **Actions** | 1. For each extracted symptom→fix record, generate 2-3 natural-language user utterances ("my washer is making a grinding noise and won't spin", "washer sounds like rocks inside"). 2. Pair each utterance with a structured diagnostic response following the PRD's confidence + safe-steps format. 3. Generate multi-turn variants: user gives vague symptom → model asks clarifying question → user answers → model narrows diagnosis. 4. Include negative examples: user describes symptom that is a safety stop (gas smell, refrigerant leak) → model immediately stops and recommends pro. 5. Vary tone: stressed user, calm user, elderly user unfamiliar with appliances. 6. **Synthesize using a cloud LLM** (Claude 3.5 Sonnet) guided by real corpus content — each pair MUST be grounded in an actual extracted symptom→fix record, not invented. |
| **Tooling** | `~/homeops-corpus/training/generate_consumer_pairs.py` (new — calls Anthropic API with structured prompts grounded in extracted data). |
| **Acceptance criteria** | ≥5,000 instruction pairs. Each pair traceable to a specific service manual section. Safety-stop pairs ≥10% of total. Multi-turn pairs ≥20% of total. |
| **Cost estimate** | 5,000 pairs × ~1K tokens/pair × $3/1M input + $15/1M output (Sonnet) ≈ **~$90 total**. Reasonable. |

#### 4.3.2 P2-W2: Instruction Tuning Pairs — Diagnostic Package Handoff

| Item | Detail |
|------|--------|
| **Goal** | Produce 1,000–2,000 instruction-tuning pairs for the structured diagnostic package output. |
| **Actions** | 1. Use the 50 handcrafted diagnostic package templates as seeds. 2. Generate variants: same appliance, different symptoms. 3. Train the model to output valid JSON matching the diagnostic package schema. 4. Include pairs where the model must say "insufficient information — cannot produce diagnostic package" (the negative/failure case). |
| **Tooling** | `~/homeops-corpus/training/generate_diagnostic_pairs.py` (new). |
| **Acceptance criteria** | ≥1,000 instruction pairs. 100% conform to diagnostic package JSON schema. Includes boundary cases (incomplete info, conflicting symptoms). |

#### 4.3.3 P2-W3: Safety & Scope Guardrails

| Item | Detail |
|------|--------|
| **Goal** | Ensure the model reliably defers to a professional when appropriate. |
| **Actions** | 1. Define safety-stop criteria from PRD §6: gas smell, refrigerant, standing water + electrical, any situation where user safety is at risk. 2. Generate 500+ safety-stop training pairs: user describes dangerous scenario → model immediately stops, provides clear warning, recommends pro. 3. Generate 200+ "out of scope" pairs: user asks about non-appliance topics, requests illegal modification, asks for medical advice → model declines gracefully. 4. Hard-code safety rules as a pre-filter (as in the PRD architecture) — the model should ALSO be trained to refuse, but the pre-filter is the failsafe. |
| **Tooling** | `~/homeops-corpus/training/generate_safety_pairs.py` (new). |
| **Acceptance criteria** | ≥500 safety-stop pairs. ≥200 out-of-scope pairs. Model tested on 50 dangerous scenarios — zero wrong responses (must stop or defer). |

#### 4.3.4 P2-W4: Multi-Turn Voice/Text Dialogue Samples

| Item | Detail |
|------|--------|
| **Goal** | Train the model for natural conversational flow (not just single-turn Q&A). |
| **Actions** | 1. Write 200 multi-turn diagnostic dialogues (3-7 turns each) based on real service manual troubleshooting flows. 2. Include: turn-taking, clarifying questions, follow-ups, "I tried that and it didn't work" branches, user frustration, user providing new information mid-diagnosis. 3. Voice variants: add speech disfluencies (ums, ahs), incomplete sentences, restarts — train the model to handle transcribed voice input. |
| **Tooling** | `~/homeops-corpus/training/generate_dialogue_samples.py` (new). |
| **Acceptance criteria** | ≥200 multi-turn dialogues (≥1,000 total turns). ≥30% with voice-speech characteristics. |

### 4.4 P1 — Quality & Eval

#### 4.4.1 P1-W5: Held-Out Eval Set from CR-Reviewed Models

| Item | Detail |
|------|--------|
| **Goal** | Build an evaluation dataset that measures both RAG retrieval quality and end-to-end diagnostic accuracy. |
| **Actions** | 1. From the CR ~700 reviewed models, identify 50 that have corresponding manuals in the corpus. 2. For each, write 2 error-code questions and 2 symptom-diagnostic questions (200 total). 3. Have answers verified against the actual service manual by a human (or cross-reference with GPT-4o as judge). 4. Hold out these 50 model's chunks from training data — zero contamination. 5. Run eval after every training run to track improvement. |
| **Tooling** | `~/homeops-corpus/eval/build_eval_set.py` + `~/homeops-corpus/eval/run_eval.py` (adapt from corpus build plan §8.3). |
| **Acceptance criteria** | 200-question held-out set. Precision@5 ≥ 0.80 for retrieval. Answer accuracy ≥ 85% for error codes, ≥ 75% for symptom diagnosis. Zero DANGEROUS ratings (hard gate). |

#### 4.4.2 P1-W6: Hallucination Risk Controls

| Item | Detail |
|------|--------|
| **Goal** | The model must not invent model numbers, error codes, or part numbers. |
| **Actions** | 1. Train with explicit "I don't know" / "I don't have information about that specific model" pairs. 2. During inference, cross-reference any model number or error code the model produces against the RAG retrieval results — if not found in a retrieved chunk, flag as potential hallucination. 3. Add a "citation required" rule: every diagnostic claim must cite a source chunk. If the fine-tuned model cannot cite, it must express uncertainty. |
| **Tooling** | Inference-time validation in the gateway. Training data includes negative examples. |
| **Acceptance criteria** | Hallucination rate <3% on 200-question eval set (model invents a model number, error code, or part number not in corpus). |

### 4.5 P0 — Governance

#### 4.5.1 P0-W5: Licensing Posture & Training Data Provenance

| Item | Detail |
|------|--------|
| **Goal** | Establish a defensible licensing posture for using corpus-derived data in fine-tuning. |
| **Actions** | 1. **For RAG:** Continue Posture A (Embed + Cite) — well-supported by Google Books precedent. No change needed. 2. **For fine-tuning:** The legal analysis is different. Fine-tuning embeds knowledge INTO model weights. It is one step further from the "search index" precedent. 3. **Strategy:** Fine-tune ONLY on synthesized/derived data (instruction pairs generated by a cloud LLM from corpus facts), NOT on raw corpus text. This adds a transformative layer. 4. **Prefer open-licensed sources:** iFixit (CC BY-NC-SA), OpenRepairData (CC BY 4.0), CPSC (public domain) for any data that goes directly into training without synthesis. 5. ⚖️ **Mandatory legal review** before any training run that uses manufacturer-copyrighted manual content. |
| **Tooling** | `~/homeops-corpus/governance/license_manifest.jsonl` — tracks every chunk's source license. |
| **Acceptance criteria** | Every training example traceable to: (a) open-licensed source, (b) public domain source, or (c) synthesized derivation with source citation. ⚖️ Legal review completed. |
| **Risk note** | This is the single largest legal risk. The corpus build plan §3 already flags fair-use as medium-risk for embedding. Fine-tuning pushes into a greyer area. Do not train until counsel signs off. |

---

## 5. Remaining Document Acquisition Priorities

### 5.1 What We Need BEFORE Training

The corpus has brand breadth but model depth is thin (~5-15% of 70,400 models). Training on the current corpus will produce a model that's fluent but generic. To close the gap:

| Priority | Category | Specific Gap | Why It Matters | Acquisition Target |
|----------|----------|-------------|---------------|-------------------|
| **P0** | AC/Heat Pump | Goodman/Daikin (0 docs beyond 1 CPSC recall) | ~12% of US residential HVAC market. Complete blind spot. | Service manuals + error code refs for top 10 Goodman/Daikin models |
| **P0** | Room AC | GE room/window AC (0 docs) | ~25% of room AC market. CR-reviewed category gap. | GE room AC service manuals for top-selling models |
| **P1** | Washer/Dryer | Top 20 CR-rated models — full service manual depth | The model must know specific error codes for the most common models consumers actually own | Tech sheets + service manuals for the 20 most-reviewed washer/dryer models |
| **P1** | Refrigerator | Top 20 CR-rated models — service manual depth | Same as above | Service manuals + error code tables |
| **P1** | Dishwasher | Top 10 CR-rated models — service manual depth | Same as above | Service manuals |
| **P1** | Error code reference sheets | Manufacturer tech sheets (1-4 page condensed error code + wiring docs) | These are the highest-signal-per-page documents for diagnostic training | Targeted acquisition of tech sheets for top 100 models by market share |
| **P2** | Small appliances | KitchenAid mixers, coffee makers, air fryers (currently only 40 PDFs total) | CR reviews 172+ coffee makers alone. Gap will grow as product scope expands | Owner's manuals + common repair guides |
| **P2** | Thin brands | Sharp (7 PDFs), Insignia (5), Hisense (4), Cove (4), State (5), Kenmore (13), Midea (11) | Budget-brand owners are the most underserved consumers | Backfill to ≥30 PDFs each for market-share parity |

### 5.2 The "Minimum Viable Training Corpus"

| Dimension | Current State | Minimum for Training | Gap |
|-----------|--------------|---------------------|-----|
| Total PDFs | 2,707 | 3,000+ (after dedup: ~2,500 clean) | Need ~500 more, priority on model-depth |
| Service manuals | 596 | 750+ | ~150 more, focused on gap brands + top CR models |
| Error code coverage | Unknown (not yet extracted) | Error code tables for ≥50% of covered models | Requires extraction pass AND targeted acquisition |
| Model depth | ~5-15% of 70,400 models | ≥20% of top-100-by-market-share models | Acquire manuals for the 100 most common appliance models in the US |
| Scanned/unreadable | Unknown (spot check: ≥1% scanned) | <5% scanned | OCR pass needed |
| Duplicates | ~210 MD5 groups | Zero byte-identical duplicates | Dedup pass needed |

---

## 6. Sequencing & Effort

### 6.1 Order of Operations

```
WEEK 1-2: P0 — CLEANING
├── P0-W1: MD5 dedup                                   [2 hours]
├── P0-W2: Stub/HTML removal                           [3 hours]
├── P0-W3: OCR for scanned PDFs                        [4 hours — batch, mostly unattended]
├── P0-W4: Filename normalization                      [3 hours]
├── P0-W5: Licensing manifest + ⚖️ legal review prep  [4 hours — mostly doc work]
└── GATE: Corpus is clean. Move to structuring.

WEEK 3-4: P1 — STRUCTURING
├── P1-W1: Per-document metadata extraction            [6 hours — batch processing + manual QA]
├── P1-W2: Error-code table extraction                 [8 hours — pdfplumber + LLM assist]
├── P1-W3: Symptom→cause→fix extraction                [8 hours — mostly LLM-assisted]
├── P1-W4: Diagnostic package template construction    [4 hours — schema + 50 examples]
├── P1-W5: Held-out eval set construction              [6 hours — write 200 questions]
└── GATE: Corpus is structured. Metadata complete. Eval set ready.

WEEK 5-6: P2 — TRAINING DATA
├── P2-W1: Consumer instruction pairs (5K-10K)         [12 hours — LLM generation + QA]
├── P2-W2: Diagnostic package pairs (1K-2K)            [6 hours]
├── P2-W3: Safety guardrail pairs (700+)               [4 hours]
├── P2-W4: Multi-turn dialogue samples (200+)          [8 hours]
└── GATE: Training dataset complete. Ready for fine-tuning.

WEEK 7+: TRAINING + EVAL
├── Fine-tune Maple-Preview (LoRA/QLoRA) on dataset    [4-8 hours on single GPU]
├── Run held-out eval set                              [2 hours]
├── Iterate: fix poor performers, add more data        [ongoing]
└── GATE: Zero DANGEROUS ratings. Accuracy ≥ 85%/75%.
```

### 6.2 Effort Summary

| Phase | Workstream | Est. Person-Hours | Automation Level |
|-------|-----------|-------------------|-----------------|
| P0 | Cleaning & validation | 16 hours | 80% automated, 20% manual QA |
| P1 | Structuring & enrichment | 32 hours | 60% automated, 40% LLM-assisted |
| P2 | Training data construction | 30 hours | 70% LLM-generated, 30% manual curation |
| P2 | Quality & eval | 12 hours | 50% automated eval, 50% human judgment |
| P0 | Governance | 4 hours + ⚖️ legal | Doc work, not automatable |
| **Total** | | **~94 hours + legal review** | 2-3 weeks solo founder + AI agents |

### 6.3 Can We Skip to Training?

**No.** The minimum bar before any training run is:

1. **Dedup + stub removal + OCR** (P0-W1 through P0-W3). Training on duplicate/scanned/stub data is worse than training on less data.
2. **Error-code extraction** (P1-W2). Without structured error codes, the model will hallucinate codes.
3. **A held-out eval set** (P1-W5). You cannot improve what you cannot measure.
4. **Safety guardrails** (P2-W3). Must be in the training data from run #1.

**Minimum viable corpus state to start training:** ~2,500 clean, deduplicated PDFs with metadata, error codes extracted, and a 200-question eval set. This is achievable in 2-3 weeks.

---

## 7. Risks & Open Questions

### 7.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Legal challenge to fine-tuning on copyrighted manuals** | Medium | High — could force retraining or takedown | Synthesize training data through cloud LLM (transformative layer). License posture A for RAG. Get legal review before training. |
| **Bankai fine-tuning for Bonsai is immature** | High | Medium — wasted effort if it doesn't work | Spike first (100 pairs). Don't commit Bonsai as primary candidate until Bankai is proven. |
| **Maple-Preview too large for phone on-device** | Medium | Medium — limits privacy path to laptops/tablets | 5.31 GB is tight for phones. Quantize further (4-bit = ~2.5 GB). Bonsai 1.15 GB is the phone fallback. |
| **Model hallucinates error codes** | High | High — dangerous for consumer trust | Hard retrieval gate: model must cite a corpus chunk for any error code claim. Train with "I don't know" pairs. |
| **Corpus has insufficient model depth for specific diagnostics** | High | Medium — model defaults to generic advice | Prioritize model-depth acquisition (top 100 models). RAG fallback for uncovered models. |
| **OCR quality on scanned manuals is poor** | Medium | Medium — garbled text produces bad training data | Flag low-confidence OCR for human review. Prioritize born-digital PDFs for training data. |

### 7.2 Open Questions (for Benjamin)

| ID | Question | Context |
|----|----------|---------|
| **OQ-01** | **On-device target form factor?** Is the goal phone-only (Bonsai's 1.15 GB wins) or phone + tablet + laptop (Maple-Preview's 5.31 GB fits)? This determines which model gets the primary investment. | The PRD OQ-03 references on-device diagnostic as Phase 2 stretch goal but doesn't specify hardware targets. |
| **OQ-02** | **Legal posture for fine-tuning?** Should we proceed with the "synthesized data only" strategy described in §4.5.1, or is there an alternative (e.g., pursuing a data license from Whirlpool/GE/Encompass first)? This is a hard gate before P2 training data construction. | The corpus build plan §3 recommends Posture A (Embed + Cite) for RAG. Fine-tuning is a different legal question. |
| **OQ-03** | **Budget for cloud LLM synthesis?** Generating 5,000-10,000 instruction pairs via Claude 3.5 Sonnet will cost ~$90-180. Generating the error-code extractions and symptom→fix pairs via GPT-4o-mini is cheaper (~$20-40). Is this within scope, or should we explore cheaper open-weight alternatives? | Cost estimates are low but non-zero. |
| **OQ-04** | **Timeline for Phase 2 on-device diagnostic?** The data-prep plan assumes 3-4 weeks of prep + 1-2 weeks of training/eval. If Phase 2 is >6 months out, we could stage this work — P0 now (improves RAG), P1-P2 closer to Phase 2. | Sequencing depends on product roadmap. |
| **OQ-05** | **How important is small-appliance coverage?** CR reviews 172+ coffee makers, air fryers, blenders. The corpus has only 40 small-appliance PDFs. Is this in scope for Phase 2, or Phase 3+? | Affects document acquisition priorities. |
| **OQ-06** | **Should we attempt to license data from Encompass Parts / Marcone?** The corpus build plan §2.5 estimates $5K-$50K/year for a data license that could replace months of scraping. Has this been explored? | Could dramatically accelerate model-depth coverage. |
| **OQ-07** | **Do we have access to a certified appliance technician for data QA?** At least two quality gates (held-out eval set validation, diagnostic package template review) would benefit from a domain expert. The corpus build plan §7.3 budgets $50-100/hour for this. | Affects eval set quality and training data accuracy. |
| **OQ-08** | **Is the hybrid architecture (RAG + fine-tune) architecturally feasible on React Native/Expo?** The architecture doc §5 shows RAG via pgvector on Supabase (cloud). On-device requires a local vector store (e.g., an on-device SQLite with vector extension, or a compressed index). This needs its own architecture spike. | Cross-cutting concern: data prep assumes this is solvable. Is it? |

---

## 8. Appendix — Model Research Notes

### 8.1 Bonsai 8B / Ternary Bonsai 8B (PrismML)

- **Source:** PrismML (Caltech spinout, backed by Khosla Ventures, Cerberus, Google)
- **Announced:** March 31, 2026 (1-bit); Ternary variant announced later
- **Architecture:** True 1-bit (every weight 0 or 1, all layers). Ternary uses -1, 0, +1. Based on Qwen3 architecture: 36 layers, 4096 hidden dim, GQA with 32 query heads / 8 KV heads
- **Size:** 1.15 GB (1-bit), 1.75 GB (ternary) — 12-14x smaller than equivalent full-precision 8B models
- **Benchmarks (ternary):** Avg 75.5 (MMLU Redux 72.6, MuSR 56.2, GSM8K 91.0, HumanEval+ 77.4, IFEval 81.8, BFCLv3 73.9)
- **Speed:** 131 tok/s on M4 Pro, 368 tok/s on RTX 4090, ~44 tok/s on iPhone 17 Pro Max
- **License:** Apache 2.0
- **Fine-tuning:** Bankai XOR patches (open-source). NOT standard LoRA. Method is young (April 2026). Demonstrated for math/coding domain adaptation at small scale.
- **Source verification:** prismml.com/news/bonsai-8b, prismml.com/news/ternary-bonsai, github.com/nikshepsvn/bankai

### 8.2 Maple-Preview (DeepGrove)

- **Source:** DeepGrove
- **Announced:** ~August 4, 2026 (very recent)
- **Architecture:** 20B-A1B ternary-weight MoE. 24 layers, 256 experts (8 active per token), 3:1 SWA-512:GA attention
- **Size:** 5.31 GB checkpoint. 131,072 token context window
- **Benchmarks:** SOTA reasoning for weight class — competitive with larger models on LCBv6, AIME 2026, HMMT 2026, GPQA-D. Solves IMO-level problems.
- **Speed:** 218 tok/s on M4 Mac mini
- **License:** MIT
- **Fine-tuning:** Standard architecture — likely supports LoRA/QLoRA via Transformers/Axolotl/Unsloth. Caveat: minimal post-training for agentic domains; may need substantial instruction tuning.
- **Source verification:** huggingface.co/deepgrove/maple-preview, reddit.com/r/LocalLLaMA (discussion thread)

---

*HomeOps Corpus Data-Prep Plan v1.0 — Winston (BMAD System Architect) — 2026-08-09*
*"Data prep is not glamorous. It is also not optional."*
