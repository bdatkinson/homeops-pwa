# HomeOps — Personalized-Fleet Execution: Step-by-Step

**Companion to:** `homeops-personalized-fleet-design-v1.0.md`
**Date:** 2026-08-16
**Status:** Ready to execute. Steps 1–3 have no dependency on the DKM extraction pipeline, training, or licensing sign-off.

---

## The scenario (why this exists)

A HomeOps user scans the 3–4 appliances in their home (washer, dryer, fridge, dishwasher). The system knows exactly which models they own and serves diagnostics ONLY for those models. Personalization = **per-model diagnostic packs** (facts) + optional **brand/family LoRA adapter** (behavior), downloaded to the device. The model never recalls error codes — it executes retrieved ones.

**Spike-verified numbers (2026-08-16, real manuals):** 3-appliance fleet ≈ 14.4 KB raw / 4.7 KB gzip / ~3,700 tokens. Retrieval is effectively free (exact-match 0.07 µs; SQLite FTS5 4.2 µs). Diagnostic-worthy content is only 1.5–6.7% of manual text — the pack is ~1000× smaller than the PDF.

---

## Phase 0 — Build the pack foundation (NOW, 2–3 days, no gates)

**Step 1. Pack format v1 + tooling (1 day)**
- [ ] Lock the diagnostic-pack JSON schema (dkm-v1, per design §4.2): model/family/category, error codes, procedures, safety rules, parts, provenance (source doc + pages), license tag, pack_version, schema signature.
- [ ] Validation + signing tooling: validate against schema, sign with Ed25519, gzip/zstd compress.
- [ ] Sample packs already exist as proof: `~/homeops/_bmad-output/spikes/personalized-fleet/sample_packs/` (LG WM3700HWA, Bosch 800 Plus, Whirlpool LEW0050PQ, Samsung RF28R7201).

**Step 2. Pack server + registry (1–2 days)**
- [ ] Supabase table `diagnostic_packs` (model_number, family, pack_version, hash, size, updated_at).
- [ ] Gateway read path: `GET /api/v1/packs/{model_number}` + manifest endpoint.
- [ ] Fleet bundle resolver: passport appliances → pack manifest (3–4 packs + 1–3 adapters) → background download.
- [ ] OTA: version+hash poll, delta download, Ed25519 verify on device.

**Step 3. Reframe the model scorecard to "pack executor" (1 day, runs in parallel)**
- [ ] Zero-shot spike harness, pack-scoped: does the model execute retrieved steps correctly (not recall facts)?
- [ ] Candidates: Qwen3 1.5B/3B, Phi-4-mini, Maple-Preview 20B-A1B. Bonsai demoted to zero-shot only (Bankai XOR ≠ LoRA — breaks the adapter layer). TinyML µC-class = no.

**GATE 1:** Pack format + signing + registry reviewed; sample packs load on-device. → proceed to Phase 1.

---

## Phase 1 — Extraction pilot, pack output (WEEK 1–2)

**Step 4.** Run extraction S1–S6 (per `homeops-diagnostic-extraction-slm-plan-v1.0.md`) on 1 brand family → emit **real packs**, not loose JSON.
**Step 5.** Automate pack validation gates (round-trip ≥80%; safety audit clean).
**Step 6.** Measure pack sizes end-to-end; validate on-device index + retrieval latency.

**GATE 2:** ≥80% round-trip; safety clean; sizes measured. → Phase 2.

---

## Phase 2 — Extraction scale, top-N families (WEEK 3–5)

**Step 7.** Prioritize **top-50 families (P0)** by market share (LG/GE/Whirlpool/Samsung first) — the models people actually own; not all 48 brands.
**Step 8.** Knowledge-level dedup at pack level (corpus overlap analysis: 8.9% byte-dups, 31.9% near-dup at ≥0.50, 67.8% shared boilerplate → dedup + boilerplate-strip first).
**Step 9.** Conflict handling: cross-model `references` in packs; conflict report; never silently merge.

**GATE 3:** Top-50 families covered; per-pack conflict rate <5%. → Phase 3.

---

## Phase 3 — Training: base role model + per-family LoRA (WEEK 5–7)

**Step 10.** Base-model instruction pairs — role: "execute retrieved steps" (reuses v1.0 P2-W1/W2/W3 data plan).
**Step 11.** Per-family LoRA adapters (few MB each) on synthesized, pack-derived pairs — top-10 families first.
**Step 12.** **Synthetic households** (NEW asset): multi-appliance, multi-turn dialogues ("dryer got loud after I ran the washer" → correct pack routing; gas-vs-electric safety).
**Step 13.** Per-family eval + pack-consistency hallucination check (model must cite pack records for codes/parts).

**GATE 4:** Zero DANGEROUS ratings (incl. gas-vs-electric); accuracy ≥85% codes / ≥75% symptoms; OQ-02 licensing sign-off before any fine-tune.

---

## Phase 4 — Deploy (WEEK 8+)

**Step 14.** T1 served SLM (Maple-Preview + family LoRA) behind gateway.
**Step 15.** T2 on-device (Qwen3 1.5B/3B + fleet packs + family LoRA), offline mode.
**Step 16.** Continuous loop: cron scraper → re-extract → pack version bump → OTA.

---

## Hard gates (no skipping)

1. Pack format + signing + registry reviewed (GATE 1)
2. Round-trip validation ≥80% per pack (GATE 2)
3. OQ-02 licensing sign-off — derived-data posture — before any fine-tune (GATE 4)
4. Zero DANGEROUS ratings on 50 safety scenarios, including gas-vs-electric (GATE 4)
5. Model scorecard from the spike harness, evaluated pack-scoped (GATE 1→3)

**Effort:** ~80–100 person-hours total; ~3–4 weeks solo founder + AI agents.
