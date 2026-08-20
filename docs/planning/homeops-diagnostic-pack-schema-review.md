# HomeOps Diagnostic Pack — JSON Schema (dkm-v1) Review

**Date:** 2026-08-16
**File:** `diagnostic-pack.schema.json` (JSON Schema draft 2020-12)
**Status:** First review draft — built from the fleet design §4.2 spec + the 4 real spike packs (LG WM3700HWA, Bosch 800 Plus, Whirlpool LEW0050PQ, Samsung RF28R7201).

---

## What this locks down

A **diagnostic pack** = a validated, signed JSON bundle of Diagnostic Knowledge Model (DKM) records for **one appliance model or family**. The app downloads 3–4 packs (the user's fleet) and the SLM executes the retrieved steps — it never recalls facts from memory.

Top-level shape (all required):

```
pack_version   semver of pack content
schema         "dkm-v1"  (ties to DKM schema version)
pack_id        brand:model:category:rev   e.g. lg:wm3700hwa:washer:1
content_hash   SHA-256 over canonical JSON   (server-set at publish)
ed25519_sig    server signature over content_hash  (server-set at publish)
model          brand, model_number, family, category, appliance_type
provenance     source_docs[], source_pages{}, extraction_method,
               license_tag, copyright_notice     ← OQ-02 gate + attribution
error_codes[]  code, name, meaning, likely_cause, action,
               safety_level, model_scope[], source
symptoms[]     canonical, variants[], procedure_ref, model_scope[]
procedures[]   id, entry_symptom, safety_level, exit_conditions[],
               steps[], model_scope[], source
parts[]        name, ref, when
safety_rules[] level, rule        ← gas vs electric differ; always per-pack
references[]   pack_ids for cross-model/family links  (empty allowed)
```

**Diagnostic step** (inside procedures): `order`, `action`, `observation`, `expected_value`, `pass_branch`, `fail_branch`, `tools[]`, `safety_level`.

**Safety levels:** 1 = consumer-safe · 2 = needs a tool · 3 = power-off/qualified handling (gas, high-voltage, refrigerant) · 4 = technician-only. Levels 3–4 are never auto-suggested to a consumer without a stop/defer prompt.

---

## Key decisions in this draft

1. **Signed at publish, verified on device.** `content_hash` + `ed25519_sig` are server-set, excluded from the hashed payload, and verified before any OTA swap. A tampered pack fails closed.
2. **Provenance is mandatory.** `source_docs`, `license_tag`, `copyright_notice` are required — the OQ-02 derived-data posture lives in the pack itself, not in a side table.
3. **`references[]` is required but empty-able** — every pack carries its family/conflict links explicitly.
4. **`model_scope[]` optional on records** — a pack is normally per-model, but multi-model manuals (e.g. Bosch SHE-SHX-SHV) can carry scoped records without splitting packs prematurely.
5. **`additionalProperties: false` everywhere** — unknown fields fail validation. Strict on purpose: the pack is a contract consumed by devices and the SLM.

---

## Migration from spike packs (build script must align)

| Spike pack (current) | Schema (canonical) | Action |
|---|---|---|
| `provenance.source_doc` (string) | `source_docs` (array) | rename + wrap |
| — (missing) | `pack_id` | derive from model |
| — (missing) | `references` | add `[]` |
| — (missing) | `content_hash`, `ed25519_sig` | server-set at publish |
| `error_codes[].name` optional | optional | no change |
| steps use `order` | `order` | no change ✅ |
| `symptoms[].canonical` | `canonical` (kept — see OQ-20) | no change |

---

## Open questions — RESOLVED (2026-08-16)

- **OQ-20 — Symptom field naming: ✅ RESOLVED — keep spike names.** `canonical`/`variants`/`procedure_ref` stay. No change to schema.
- **OQ-21 — Branching depth: ✅ RESOLVED — free-text sufficient.** `pass_branch`/`fail_branch` remain free-text strings for v1. Structured branches can be added in a future schema version if the runtime executor needs them.
- **OQ-22 — Safety-level policy: ✅ RESOLVED — all levels viewable with warnings.** Consumers may see all levels (1–4); steps at levels 3–4 display an explicit `warning` string before execution. Schema updated: `diagnosticStep.warning` added (optional in JSON, **required by policy when safety_level ≥ 3**); `safetyLevel` description now records the policy. Safety_rules remain per-pack (gas vs electric differ).

---

*Companion to: `homeops-personalized-fleet-design-v1.0.md` · `homeops-fleet-step-by-step-v1.0.md`*
