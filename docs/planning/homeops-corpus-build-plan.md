# HomeOps — Appliance Service Manual Corpus Build Plan

**Version:** 1.0  
**Date:** 2026-07-16  
**Owner:** HomeOps Founder  
**Status:** Active — use this document to drive corpus build execution  

> **Working document.** Dense, opinionated, buildable. Every section ends with a specific action item. Items marked ⚖️ require legal review before proceeding.

---

## Table of Contents

1. [Scope Decision Framework](#1-scope-decision-framework)
2. [Source Inventory](#2-source-inventory)
3. [Legal & Licensing Analysis](#3-legal--licensing-analysis)
4. [Data Pipeline Architecture](#4-data-pipeline-architecture)
5. [Build Phases & Prioritization](#5-build-phases--prioritization)
6. [Tooling & Automation](#6-tooling--automation)
7. [Team & Timeline Estimate](#7-team--timeline-estimate)
8. [Success Criteria](#8-success-criteria)

---

## 1. Scope Decision Framework

### 1.1 Appliance Category Priority

Ordered by **failure frequency + diagnostic demand + US household penetration**. Source: Consumer Reports appliance reliability surveys, CPSC complaint volumes, RepairClinic sales data patterns.

| Priority | Category | US Penetration | Annual Failure Rate | Diagnostic Demand | Phase |
|----------|----------|---------------|--------------------|--------------------|-------|
| 1 | Dishwasher | 78% | 9–12% | High (noises, draining, error codes) | Phase 1 |
| 2 | Clothes Washer | 87% | 10–14% | Very High (F codes, not spinning, leaks) | Phase 1 |
| 3 | Clothes Dryer | 84% | 8–11% | High (not heating, squealing) | Phase 1 |
| 4 | Refrigerator | 99% | 6–9% | High (cooling failure, ice maker) | Phase 1 |
| 5 | Oven / Range | 91% | 5–8% | Medium (igniter, error codes) | Phase 2 |
| 6 | Microwave | 95% | 4–7% | Low (mostly replace-not-repair) | Phase 2 |
| 7 | HVAC / Furnace | 91% | 8–12% | Very High (complex, safety-critical) | Phase 2 |
| 8 | Water Heater | 95% | 6–10% | High (no hot water, pilot issues) | Phase 2 |
| 9 | Garbage Disposal | 55% | 7–10% | Low (simple, 3-step fix usually) | Phase 3 |
| 10 | Dishwasher (commercial) | — | — | Future | Phase 3 |

**Decision: Phase 1 ships with top 4 categories only.** Washer + Dryer can share pipeline infrastructure.

### 1.2 Coverage Depth Definition

Not all documentation types are equal. Rank by diagnostic value:

| Document Type | Diagnostic Value | Passport Value | Priority |
|--------------|-----------------|----------------|----------|
| Full Service/Tech Manual | ★★★★★ | ★★★ | **Must-have Phase 1** |
| Error Code Reference | ★★★★★ | ★★★ | **Must-have Phase 1** |
| Wiring Diagrams | ★★★★ | ★★ | Phase 1 (embedded in service manual) |
| Parts Catalog / Exploded Views | ★★★ | ★★★★ | Phase 2 |
| Installation Manual | ★★ | ★★★★ | Phase 2 (model/year confirmation) |
| User/Owner Manual | ★★ | ★★★ | Phase 0 fallback if no service manual |
| Quick Start Guide | ★ | ★ | Skip — too thin |

**Rule:** If a service/tech manual exists → ingest it. If not → ingest owner manual as fallback, tag `coverage_depth: owner_manual_only`. Never ingest quick-start guides as primary source.

### 1.3 Coverage Target — "Complete Enough to Ship"

| Phase | Target | Rationale |
|-------|--------|-----------|
| Phase 0 | 500,000 unique model numbers in a lookup table (make/model/year/category) | Enough to confirm appliance existence for passport seeding — no full manual needed |
| Phase 1 | 50,000 service manuals covering 300,000+ model variants across top 4 categories | One manual often covers 10–50 model variants (e.g., WDT780SAEM covers 8 sub-variants) |
| Phase 2 | 200,000 service manuals across all 8 categories | Full corpus — 24-month goal |

**Key insight:** Model numbers are many-to-one with manuals. A single GE dishwasher service manual covers 12 model variants. Track both the canonical manual and all model numbers that map to it.

---

## 2. Source Inventory

### 2.1 Manufacturer Portals

⚖️ **All manufacturer scraping requires legal review of ToS before automated ingestion.**

| Manufacturer | US Market Share (appliances) | Manual Portal URL | Download Available | robots.txt Scrape | ToS Restriction | Quality Rating | Notes |
|-------------|---------------------------|------------------|--------------------|-------------------|-----------------|----------------|-------|
| Whirlpool | ~18% | `producthelp.whirlpool.com/manuals/{model}` | Yes — direct PDF | Restricted | Prohibits scraping | ★★★★★ | Covers Whirlpool, Maytag, KitchenAid, JennAir brands |
| Maytag | (Whirlpool subsidiary) | `producthelp.maytag.com/manuals/{model}` | Yes — direct PDF | Restricted | Same ToS as Whirlpool | ★★★★★ | Same PDF CDN as Whirlpool |
| KitchenAid | (Whirlpool subsidiary) | `kitchenaid.com/manuals/{model}` | Yes | Restricted | Same ToS as Whirlpool | ★★★★★ | High-end only |
| GE Appliances | ~15% | `geappliances.com/service/manuals` → `products.geappliances.com` | Yes — PDF download button | Partial block | Restricted | ★★★★★ | Now Haier-owned; service tech portal requires registration |
| LG Electronics | ~12% | `lge.com/us/support/{model}` | Yes | Restricted | Prohibits automated download | ★★★★★ | PDF behind CAPTCHA/login for service manual |
| Samsung | ~11% | `samsung.com/us/support/{model}` | Yes — PDF | Restricted | Strict ToS | ★★★★ | Service manuals sometimes require dealer account |
| Frigidaire | ~10% | `frigidaire.com/manuals/` | Yes | Partial | Restricted | ★★★★ | Electrolux subsidiary |
| Electrolux | (Frigidaire parent) | `electroluxappliances.com/support/` | Yes | Partial | Restricted | ★★★★ | Shared portal with Frigidaire |
| Bosch | ~6% | `bosch-home.com/us/support/` | Yes — PDF | Restricted | Restricted | ★★★★★ | Very complete service manuals; BSH group (Bosch, Siemens, Thermador) |
| Miele | ~3% | `miele.com/en/us/consumer/support/` | Partial — login required | Restricted | Strict | ★★★★★ | Premium brand; requires dealer login for full service docs |
| Speed Queen | ~2% | `speedqueen.com/consumer-resources/` | Yes | Permissive | Lenient | ★★★★★ | Commercial/residential laundry; ToS relatively open |
| Amana | (Whirlpool subsidiary) | `amana.com/manuals/` | Yes | Restricted | Same ToS as Whirlpool | ★★★★ | Budget segment |

**Action item:** Draft a templated email to each manufacturer's developer relations / partner program requesting a data license or API access for diagnostic use. Lead with Right to Repair angle. Whirlpool and GE have been most receptive to authorized partners in the past.

### 2.2 Third-Party Aggregators

| Source | URL | Access Method | Licensing | Quality | Covers | Notes |
|--------|-----|--------------|-----------|---------|--------|-------|
| ManualsLib | `manualslib.com` | Free browse/download (account required for bulk) | ⚠️ ToS prohibits scraping; individual download allowed | ★★★★ | 5M+ manuals across categories | Best coverage; has service manuals mixed with user manuals. Fingerprinting likely. |
| ManualsOnline | `manualsonline.com` | Free download | ⚠️ ToS restricts automated access | ★★★ | ~800K manuals | Older database, less updated |
| RepairClinic | `repairclinic.com` | HTML pages + embedded docs | ⚠️ Strict ToS | ★★★★ | Error codes, symptoms, parts | Structured diagnostic content — high value if licensed |
| Appliance Aid | `applianceaid.com` | Free HTML | Unclear/informal ToS | ★★★ | Error codes by brand/model | Small but curated by technician; public domain feel |
| Fixya | `fixya.com` | Free browse | ToS restricts scraping | ★★ | Q&A format repair knowledge | Low signal-to-noise; not primary source |
| AppliancePartsPros | `appliancepartspros.com` | Free browse | Restricted | ★★★ | Parts + some symptom content | Parts catalog useful for Phase 2 |
| iFixit | `ifixit.com` | **CC BY-NC-SA** | ✅ Open license | ★★★ | 80K+ repair guides | Best open-licensed source; appliance coverage limited vs. electronics |
| OpenRepairData | `openrepair.data.repair` | **Open Dataset — CSV download** | ✅ CC BY 4.0 | ★★ | Repair records, not manuals | Useful for failure frequency analysis, not manual corpus |
| Scribd | `scribd.com` | Subscription | Restricted | ★★★ | Some service manuals uploaded by users | Copyright status unclear per document |

### 2.3 Government Sources

| Source | URL | Access Method | Licensing | Content | Use Case |
|--------|-----|--------------|-----------|---------|----------|
| CPSC Recalls Database | `recalls.gov` + `cpsc.gov/recalls` | **Free JSON API** | ✅ Public domain | Recall notices with make/model/date | **Phase 0 must-have** — enrich passport with recall status |
| CPSC SaferProducts | `saferproducts.gov` | Free API | ✅ Public domain | Consumer incident reports | Phase 2 — failure mode analysis |
| FCC Equipment Authorization | `fcc.gov/oet/ea` | Free search | ✅ Public domain | Not applicable for appliances | Skip |
| DOE Appliance Standards DB | `energy.gov/eere/appliance-standards` | Free download | ✅ Public domain | Energy efficiency by model | Phase 2 — adds passport value |
| EnergyStar Portfolio Manager | `energystar.gov` | Free API | ✅ Public domain | Certified product database | Phase 0 — model lookup, year of manufacture estimate |

**Action item:** CPSC API is the single most important government integration. Endpoint: `https://www.saferproducts.gov/RestWebServices/Recall?RecallID=&ProductType=appliance&format=json`. Pull the full recall database on Day 1 — no legal risk, high passport value.

### 2.4 Open Data Sets

| Dataset | URL | License | Content | Quality | Notes |
|---------|-----|---------|---------|---------|-------|
| iFixit Repair Guides | `ifixit.com/api/2.0` | CC BY-NC-SA 3.0 | Structured repair guides, appliance coverage thin | ★★★ | Best open-licensed repair content available |
| Open Repair Data Standard | `openrepair.data.repair` | CC BY 4.0 | Repair event records (not manuals) | ★★ | 200K+ repair events; good for failure frequency data |
| WikiData appliance models | `wikidata.org` | CC0 | Brand/model metadata, minimal | ★ | Useful for manufacturer → brand → subsidiary mapping |
| Internet Archive | `archive.org` | Mixed | Scanned old manuals, pre-1978 copyright lapse likely | ★★★ | Some vintage manuals in public domain; search `subject:appliance manuals` |

**Reality check:** There is no comprehensive CC-licensed appliance service manual dataset. iFixit is the closest thing but is consumer-repair-guide format, not technician service manuals. The corpus will be built primarily through licensed or ToS-compliant access.

### 2.5 Paid / Licensed Data Brokers

| Provider | URL | What They License | Estimated Cost | Notes |
|----------|-----|-------------------|---------------|-------|
| IHS Markit (now Clarivate) | `clarivate.com` | Technical documentation databases | $$$$ — enterprise | Primarily auto/aerospace; appliance vertical thin |
| ShurTech / Encompass Parts | `encompassparts.com` | Parts data + some documentation | $$$ | Worth a call — they license data to repair platforms |
| PartSelect / Repair Clinic (parent: Encompass) | — | Structured parts + symptom data | $$$ | Their data feeds are licensed to B2B partners |
| Appliance 411 | `appliance411.com` | Reference database | $ | Independent technician resource; may be open to deal |
| HomeAdvisor / Angi data | — | Service records, not manuals | $$ | Not applicable |
| Marcone Supply | `marconesupply.com` | Parts catalog data | $$$ | Major distributor — has model coverage data |

**Recommendation:** Before building a scraper, spend 2 hours calling Encompass Parts and Marcone Supply. They already have the model-number → manual mapping problem solved internally. A data license may be cheaper than building the pipeline from scratch.

---

## 3. Legal & Licensing Analysis

⚖️ **This entire section requires review by an IP attorney before acting on any recommendation.**

### 3.1 Fair Use Framework for Service Manuals

The core question: can HomeOps reproduce (chunks of) copyrighted service manuals in a RAG corpus?

**Four-factor fair use analysis (17 U.S.C. § 107):**

| Factor | HomeOps Position | Risk Level |
|--------|-----------------|------------|
| **Purpose & Character** | Transformative — converting raw PDF into diagnostic AI responses is a new use; commercial but serves repair/safety public interest | Low-Medium |
| **Nature of the Work** | Factual/technical documentation (weaker copyright than creative works); functional content gets thinner protection | Low |
| **Amount Used** | Full ingestion of manuals → embeddings. Retrieval returns chunks, not whole manuals. Key question: are the stored embeddings "reproduction"? | Medium |
| **Market Effect** | Not a manual repository substitute (not distributing PDFs); might argue it increases value of authorized manuals by making them findable | Low-Medium |

**Relevant precedent:**
- *Authors Guild v. Google* (2d Cir. 2015): Book scanning for search index = transformative fair use. Strongest precedent for corpus ingestion without redistribution.
- *Kelly v. Arriba Soft* (9th Cir. 2003): Image thumbnailing for search = transformative.
- *HathiTrust Digital Library* (2014): Full-text indexing for search/accessibility = fair use even with full copy stored.
- The embedding-only approach (never returning raw PDF, only LLM-generated responses grounded in the manual) parallels Google Books most closely.

**The "embed and cite, don't redistribute" model has the strongest fair use footing.**

### 3.2 Right to Repair Legal Landscape

**Critical: Right to Repair directly benefits HomeOps' legal position.**

| Jurisdiction | Status | Key Provisions | Impact on HomeOps |
|-------------|--------|---------------|-------------------|
| Federal (REPAIR Act, proposed) | Pending — introduced 2023 | Requires manufacturers to provide repair docs to independent shops | Would mandate manufacturer access if passed |
| Colorado | ✅ Passed 2023 (SB 23-016) | Agricultural/motorized equipment; not home appliances yet | Limited direct impact |
| New York | ✅ Passed 2023 (Digital Fair Repair) | Electronics focus; appliances excluded | Limited direct impact |
| California | ✅ Passed 2021 (SB 542) | Requires repair docs be available; appliances covered partially | **Strongest state law for HomeOps** |
| Minnesota | ✅ Passed 2023 | Broad electronics repair | Limited |
| 20+ other states | Pending 2024–2026 bills | Varying scope | Trend is clearly toward mandated access |

**Strategic implication:** Frame HomeOps as a Right to Repair infrastructure platform. This is legally accurate and is a strong public interest argument in any fair use defense. It also opens doors with repair-friendly manufacturers.

### 3.3 Safe Harbor & Recommended Posture

**Three postures ranked by legal risk:**

| Posture | Description | Legal Risk | UX Impact |
|---------|-------------|------------|-----------|
| **A: Embed + Cite (Recommended)** | Ingest manuals into vector DB; return LLM responses grounded in chunks; always cite source manual + page; never serve raw PDFs | Low | Slightly verbose responses with citations |
| **B: Index + Link** | Store metadata only; retrieve and process on-demand at query time; return link to original source | Very Low | Slower; requires live access to source |
| **C: Full Reproduction** | Store and serve raw PDFs/pages | High | Best UX; highest legal exposure |

**Recommendation: Posture A — Embed + Cite.**
- Store embeddings (vectors) of manual chunks — this is the Google Books precedent territory
- At response time: retrieve relevant chunks, pass to LLM, generate answer, append source citation
- Never expose raw PDF content directly to users
- Retain source URL + page reference in metadata for every chunk
- Display citation: "Based on [Whirlpool WDT780SAEM Service Manual, Section 4.3, Error Codes, p. 42]"

### 3.4 Privacy — Serial Number Lookup Isolation

**Non-negotiable:** Serial number lookup must be user-isolated.

- Serial → model lookup is a read-only operation against the corpus
- No user's serial number is stored in the corpus itself — only in the user's own HomeOps passport record
- Corpus metadata stores model numbers only, never serials
- If multiple users own the same model, they get the same corpus results — no cross-contamination
- GDPR/CCPA: serial numbers may be PII if traceable to a specific household appliance — store with encryption at rest, never log in plaintext

---

## 4. Data Pipeline Architecture

### 4.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      INGESTION LAYER                            │
│  Scrapy spider  │  Playwright scraper  │  Manual upload  │ API  │
└────────┬────────┴──────────┬──────────┴────────┬────────┴──┬───┘
         │                  │                    │            │
         └──────────────────┴────────────────────┘            │
                            │                                  │
                     Raw File Store                            │
                  (Supabase Storage or S3)                     │
                            │                                  │
         ┌──────────────────┴──────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────┐
│                    EXTRACTION LAYER                               │
│  PDF native text (pdfplumber)                                     │
│  PDF scanned/image (marker-pdf → OCR via Tesseract/Google Vision) │
│  HTML (trafilatura / BeautifulSoup)                               │
│  Structured data (JSON/CSV → direct ingest)                       │
└────────┬─────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────┐
│                   PROCESSING LAYER                                │
│  Deduplication (MinHash LSH)                                      │
│  Quality scoring (rule-based classifier)                          │
│  Section detection (regex + LLM-assisted heading extraction)      │
│  Model number extraction + normalization                          │
│  Metadata enrichment (CPSC recall lookup, DOE EnergyStar)        │
└────────┬─────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────┐
│                    CHUNKING LAYER                                 │
│  Section-aware chunking (preserve section hierarchy)              │
│  Error code tables → structured records (JSON, not prose chunks)  │
│  Wiring diagram references → metadata link, not embedded          │
│  Chunk size: 512 tokens target, 100 token overlap                 │
└────────┬─────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────┐
│                   EMBEDDING LAYER                                 │
│  OpenAI text-embedding-3-small (1536 dims) — primary             │
│  Batch API (50% cost savings vs. sync API)                        │
└────────┬─────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────────────────────────────────────────────┐
│                    STORAGE LAYER                                  │
│  pgvector on Supabase (recommended — see §4.5)                    │
│  Metadata: PostgreSQL tables (same Supabase instance)             │
│  Raw files: Supabase Storage (or S3-compatible)                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Ingestion

| Source Type | Tool | Notes |
|------------|------|-------|
| Static PDFs (direct URL) | `httpx` + async download queue | Respect rate limits (1 req/sec per domain) |
| JS-rendered pages | Playwright (headless Chromium) | Use only when static scraping fails |
| Manufacturer portals (CAPTCHA/login) | Semi-manual + Playwright session replay | Record auth session once, replay |
| Bulk catalog pages | Scrapy with custom middlewares | Robots.txt compliance middleware required |
| Structured APIs (CPSC, EnergyStar) | Direct API client | No scraping needed |

**Storage:** All raw files land in Supabase Storage (or S3) with path `raw/{source_slug}/{manufacturer}/{model_normalized}/{filename}`. Never re-download if SHA-256 hash already exists in the manifest.

### 4.3 Extraction Tooling

| Content Type | Primary Tool | Fallback | Notes |
|-------------|-------------|----------|-------|
| Native PDF (text layer) | `pdfplumber` | `PyMuPDF (fitz)` | pdfplumber better for table extraction; PyMuPDF faster for bulk |
| Scanned PDF (image-only) | `marker-pdf` (nougat-based) | Google Cloud Vision API | marker-pdf is open-source and handles technical docs well; use Cloud Vision for stubborn docs |
| HTML pages | `trafilatura` | `BeautifulSoup + lxml` | trafilatura has better boilerplate removal |
| Structured error code tables | `pdfplumber` table extraction → JSON | LLM-assisted extraction (GPT-4o) | Tables need special handling — don't chunk as prose |

**Key:** Detect whether a PDF has a text layer before running OCR. `PyMuPDF`: `if page.get_text().strip() == "": run_ocr()`. Scanned manuals (pre-1990s) will need full OCR pipeline.

### 4.4 Chunking Strategy

**Not all content should be chunked the same way:**

| Content Type | Chunking Strategy | Chunk Size | Rationale |
|-------------|------------------|------------|-----------|
| Prose sections (troubleshooting, operation) | Recursive text splitter, section-boundary-aware | 512 tokens, 100 overlap | Standard RAG; keep section headers in each chunk |
| Error code tables | Extract as **structured records** per error code | 1 record = 1 chunk | Error code queries need exact match, not semantic similarity |
| Wiring diagrams | Metadata pointer only (page ref + image URL) | No text chunk | Can't embed diagrams usefully; provide reference |
| Parts lists | Structured records (part number → description → models) | 1 part = 1 chunk | Supports Phase 2 parts lookup |
| Spec sheets | Key-value extraction → JSON chunk | 1 spec block = 1 chunk | Structured retrieval works better than embedding |

**Section detection:** Extract section headings with a regex pipeline first (`^[A-Z\s]{4,40}$` on lines, or TOC parsing). If heading detection fails, fall back to GPT-4o-mini to identify section boundaries (batch call, cheap at $0.15/1M input tokens).

**Metadata injected into every chunk:**
```json
{
  "chunk_id": "uuid-v4",
  "doc_id": "uuid-v4",
  "make": "Whirlpool",
  "model_canonical": "WDT780SAEM",
  "model_variants": ["WDT780SAEM1", "WDT780SAEM2", "WDT780SAEMZ"],
  "appliance_type": "dishwasher",
  "year_start": 2018,
  "year_end": 2022,
  "doc_type": "service_manual",
  "section": "Error Codes",
  "section_path": "Section 4 > 4.3 Error Codes",
  "page_ref": 42,
  "source_url": "https://...",
  "source_slug": "whirlpool_portal",
  "license": "copyright_fair_use",
  "ingestion_date": "2026-07-16",
  "coverage_depth": "service_manual"
}
```

### 4.5 Embedding Model Selection

| Model | Dimensions | Cost (per 1M tokens) | Quality (MTEB) | Recommendation |
|-------|-----------|---------------------|----------------|----------------|
| `text-embedding-3-small` | 1536 | $0.02 | 62.3 | ✅ **Primary choice** |
| `text-embedding-3-large` | 3072 | $0.13 | 64.6 | Phase 2 upgrade if precision insufficient |
| `text-embedding-ada-002` | 1536 | $0.10 | 61.0 | Legacy — skip |
| `nomic-embed-text-v1.5` | 768 | Free (self-hosted) | 62.4 | Self-host option if OpenAI costs spike |
| `mxbai-embed-large` | 1024 | Free (self-hosted) | 64.7 | Best open alternative if going self-hosted |

**Decision: `text-embedding-3-small` via OpenAI Batch API.**  
Cost estimate for Phase 1 corpus (50K manuals × avg 200 chunks × 512 tokens): ~512M tokens × $0.02/1M = **~$10 total embedding cost**. Negligible. Use Batch API (async, 50% discount) for all bulk runs.

### 4.6 Vector Store Decision

| Option | Hosting | Cost at 10M vectors | Query Latency | Management | Recommendation |
|--------|---------|--------------------|--------------|-----------|-|
| **pgvector on Supabase** | Managed | ~$25/month (Pro plan) | 10–50ms | Zero ops | ✅ **Phase 1 choice** |
| Pinecone (Serverless) | Managed | ~$70–150/month at 10M | 5–20ms | Zero ops | Phase 2 if outgrow pgvector |
| Qdrant (Cloud) | Managed | ~$50–100/month | 5–15ms | Low ops | Good alternative; open source |
| Weaviate | Managed/Self | $$ | 10–30ms | Medium ops | Overkill for Phase 1 |
| Chroma | Self-hosted | Free | 20–100ms | Medium ops | Prototype only |

**Decision: pgvector on Supabase.** HomeOps is already likely on Supabase for auth + database. Adding pgvector to the same instance eliminates a dependency, halves the infrastructure complexity, and the query performance is acceptable at Phase 1 scale (< 1M vectors initially). Migrate to Pinecone if vector count exceeds 5M or p50 query latency exceeds 100ms under load.

**pgvector setup:**
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table
CREATE TABLE corpus_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make TEXT NOT NULL,
  model_canonical TEXT NOT NULL,
  model_variants TEXT[],
  appliance_type TEXT NOT NULL,
  doc_type TEXT NOT NULL,  -- service_manual | owner_manual | error_code_ref
  year_start INTEGER,
  year_end INTEGER,
  source_url TEXT,
  source_slug TEXT,
  license TEXT,
  coverage_depth TEXT,
  raw_file_path TEXT,
  ingestion_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks table with vector
CREATE TABLE corpus_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES corpus_documents(id),
  chunk_index INTEGER,
  content TEXT NOT NULL,
  section TEXT,
  section_path TEXT,
  page_ref INTEGER,
  chunk_type TEXT DEFAULT 'prose',  -- prose | error_code | spec | parts
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX ON corpus_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Model number lookup (separate from vectors — used for passport seeding)
CREATE TABLE model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number TEXT NOT NULL,
  model_normalized TEXT NOT NULL,
  make TEXT NOT NULL,
  brand TEXT,  -- KitchenAid (brand) under Whirlpool (make)
  appliance_type TEXT,
  year_introduced INTEGER,
  year_discontinued INTEGER,
  doc_id UUID REFERENCES corpus_documents(id),
  cpsc_recall_ids TEXT[],
  energystar_certified BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX ON model_registry(model_normalized);
CREATE INDEX ON model_registry(make, appliance_type);
```

### 4.7 Model Number Normalization

Appliance model numbers are notoriously inconsistent. Examples:
- `WDT780SAEM1`, `WDT780SAEM 1`, `WDT-780SAEM1`, `wdt780saem1` → same product
- `WDT780SAEM` (base) covers all color/regional variants

**Normalization algorithm:**
```python
import re

def normalize_model_number(raw: str) -> str:
    """
    Normalize appliance model numbers for consistent lookup.
    Returns a canonical form for deduplication and matching.
    """
    # 1. Uppercase, strip whitespace
    s = raw.strip().upper()
    # 2. Remove hyphens, spaces, underscores
    s = re.sub(r'[-_\s]', '', s)
    # 3. Strip trailing single-character color/regional codes
    #    e.g., WDT780SAEM1 → WDT780SAEM (the '1' is color variant)
    #    But don't strip if it's part of the core model
    s = re.sub(r'([A-Z]{2,}\d{3,}[A-Z]+)\d$', r'\1', s)
    return s

def model_family(normalized: str) -> str:
    """Extract model family prefix for fuzzy grouping."""
    # Take first 8-10 chars as family key
    return normalized[:10]
```

**Fuzzy matching at query time:**
- Exact match first (normalized model number)
- If no match: Levenshtein distance ≤ 2 on normalized form
- If still no match: model family prefix match → return all variants in that family
- Use `pg_trgm` extension in Postgres for trigram similarity search: `SELECT * FROM model_registry WHERE similarity(model_normalized, $1) > 0.7`

---

## 5. Build Phases & Prioritization

### 5.1 Phase Overview

| Phase | Name | Timeline | Corpus Goal | Pipeline Goal | Unblocks |
|-------|------|----------|-------------|--------------|----------|
| **Phase 0** | Passport Minimum | Weeks 1–3 | 500K model lookup records | Model registry + CPSC recalls | Broker demo, passport seeding |
| **Phase 1** | Diagnostic MVP | Weeks 4–16 | 50K service manuals, top 4 categories | Full RAG pipeline | Consumer diagnostic beta |
| **Phase 2** | Full Corpus | Months 5–18 | 200K+ manuals, all 8 categories | Automated ingestion + update cadence | Production scale |

### 5.2 Phase 0 — Passport Seeding Minimum (Weeks 1–3)

**Goal:** OCR model plate → confirm appliance exists, return make/model/estimated year, recall status. **No full manual needed.**

**Data sources for Phase 0 (no legal grey area):**

| Source | Data | Access | Timeline |
|--------|------|--------|----------|
| EnergyStar Product Database | 200K+ certified models with make/model/year | Free CSV download | Day 1 |
| CPSC Recall API | All recalled appliances with model numbers | Free JSON API | Day 1 |
| Manufacturer press releases / product announcement pages | Model launch dates | Manual pull | Week 2 |
| ManualsLib model index (browse only) | Model existence confirmation | Manual browse + metadata extract | Week 2–3 |

**Phase 0 deliverable:** `model_registry` table populated with at minimum:
- 150,000 unique normalized model numbers
- Make, brand, appliance type for each
- Year range estimate (from EnergyStar certification date or CPSC data)
- CPSC recall flag + recall ID if applicable

**This alone enables the broker walk-through demo.** The broker scans a model plate → normalize model number → lookup in `model_registry` → return make/model/estimated age/recall status. No manual content required.

### 5.3 Phase 1 — Consumer Diagnostic MVP (Weeks 4–16)

**Goal:** Voice/text diagnostic for top 4 categories grounded in real service manuals.

**Coverage targets:**

| Category | Target Manuals | Target Model Variants | Priority Brands | Source Strategy |
|----------|---------------|----------------------|----------------|----------------|
| Dishwasher | 5,000 manuals | 40,000+ variants | Whirlpool, GE, Bosch, LG, Samsung | Manufacturer portal (authorized) + ManualsLib (manual download) |
| Clothes Washer | 6,000 manuals | 50,000+ variants | Whirlpool/Maytag, LG, Samsung, GE | Same |
| Clothes Dryer | 5,000 manuals | 45,000+ variants | Same brands | Same |
| Refrigerator | 8,000 manuals | 60,000+ variants | Whirlpool, GE, LG, Samsung, Frigidaire | Same |
| **Phase 1 Total** | **~24,000 manuals** | **~200,000 variants** | — | — |

**Build order within Phase 1:**
1. **Whirlpool family first** (Whirlpool + Maytag + KitchenAid = ~35% US market). One portal, consistent PDF format, highest coverage per hour of pipeline work.
2. **GE Appliances second** (~15% market). Similar portal structure.
3. **LG + Samsung third** (require Playwright; JS-heavy portals).
4. **Bosch fourth** (excellent service manuals but smaller market share).
5. **Frigidaire/Electrolux fifth** (shared portal, efficient).

### 5.4 Phase 2 — Full Corpus (Months 5–18)

Expand to:
- Oven/Range, Microwave, HVAC, Water Heater
- Commercial appliances (Phase 3 consideration)
- All remaining brands
- Parts catalog integration
- Annual update cadence (new models released each September/October — trigger re-scrape)

### 5.5 Prioritization Criteria — Failure Frequency Data

Source: Consumer Reports 2023 Reliability Survey, RepairClinic published repair volumes, CPSC complaint data.

| Category | Annual US Failures (est.) | Most Common Failure Mode | Diagnostic Complexity |
|----------|--------------------------|-------------------------|-----------------------|
| Clothes Washer | 8–10M | Not spinning, F codes, leaks | High — many error codes |
| Dishwasher | 7–9M | Not draining, door latch, grinding | High — error codes vary by brand |
| Refrigerator | 5–7M | Cooling, ice maker, compressor | Very High — expensive failures |
| Dryer | 6–8M | Not heating, drum not turning | Medium — simpler mechanically |
| HVAC | 8–12M | (deferred to Phase 2) | Very High — safety critical |

---

## 6. Tooling & Automation

### 6.1 Scraping Stack

```
homeops-corpus/
├── scrapers/
│   ├── whirlpool/          # Scrapy spider for Whirlpool family
│   ├── ge/                 # Scrapy spider for GE portal
│   ├── lg/                 # Playwright scraper (JS portal)
│   ├── samsung/            # Playwright scraper
│   ├── bosch/              # Scrapy spider
│   ├── common/
│   │   ├── middleware.py   # robots.txt compliance, rate limiting
│   │   ├── downloader.py   # async HTTP download with dedup check
│   │   └── manifest.py     # SHA-256 manifest for already-downloaded files
│   └── government/
│       ├── cpsc_api.py     # CPSC recall API client
│       └── energystar.py   # EnergyStar CSV downloader
├── pipeline/
│   ├── extract.py          # PDF extraction (pdfplumber + marker-pdf)
│   ├── chunk.py            # Chunking logic
│   ├── embed.py            # OpenAI Batch API embedding
│   ├── ingest.py           # Load to Supabase
│   ├── dedup.py            # MinHash LSH deduplication
│   └── quality.py          # Quality scoring
├── scripts/
│   ├── bootstrap_phase0.sh # Pull EnergyStar + CPSC, populate model_registry
│   └── run_pipeline.sh     # Full pipeline for a batch of manuals
└── tests/
    └── retrieval_eval.py   # Held-out test question set evaluation
```

### 6.2 Scrapy Spider Template

```python
# scrapers/whirlpool/spider.py
import scrapy
from scrapy.http import Request
from corpus.middleware import RespectRobotsMiddleware
from corpus.manifest import Manifest

class WhirlpoolManualSpider(scrapy.Spider):
    name = "whirlpool_manuals"
    # ⚖️ Only run after confirming ToS compliance or obtaining license
    
    custom_settings = {
        'DOWNLOAD_DELAY': 2,  # 2 seconds between requests
        'CONCURRENT_REQUESTS_PER_DOMAIN': 1,
        'ROBOTSTXT_OBEY': True,
        'DOWNLOADER_MIDDLEWARES': {
            'corpus.middleware.RespectRobotsMiddleware': 100,
        }
    }
    
    def start_requests(self):
        # Pull model list from model_registry first
        models = self.get_whirlpool_models_from_db()
        for model in models:
            url = f"https://producthelp.whirlpool.com/manuals/{model}"
            yield Request(url, callback=self.parse_manual_page, 
                         meta={'model': model})
    
    def parse_manual_page(self, response):
        pdf_links = response.css('a[href$=".pdf"]::attr(href)').getall()
        for link in pdf_links:
            if Manifest.already_downloaded(link):
                continue
            yield response.follow(link, callback=self.save_pdf,
                                  meta=response.meta)
```

### 6.3 PDF Processing Pipeline

```python
# pipeline/extract.py
import pdfplumber
import fitz  # PyMuPDF
from pathlib import Path

def extract_pdf(path: Path) -> dict:
    """Extract text and tables from a PDF. Auto-detects if OCR needed."""
    
    # Check for text layer
    doc = fitz.open(path)
    has_text = any(page.get_text().strip() for page in doc)
    doc.close()
    
    if has_text:
        return extract_native_pdf(path)
    else:
        return extract_scanned_pdf(path)  # → marker-pdf OCR

def extract_native_pdf(path: Path) -> dict:
    result = {"pages": [], "tables": [], "metadata": {}}
    
    with pdfplumber.open(path) as pdf:
        result["metadata"] = pdf.metadata
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            tables = page.extract_tables()
            result["pages"].append({
                "page_num": i + 1,
                "text": text,
                "tables": tables
            })
    return result

def extract_scanned_pdf(path: Path) -> dict:
    """Use marker-pdf for scanned documents."""
    import subprocess, json
    result = subprocess.run(
        ["marker_single", str(path), "--output_format", "json"],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)
```

### 6.4 Deduplication

Same manual appears on manufacturer portal, ManualsLib, and third-party mirror. Deduplicate before embedding (saves cost and reduces retrieval noise).

```python
# pipeline/dedup.py
from datasketch import MinHash, MinHashLSH
import hashlib

class ManualDeduplicator:
    def __init__(self, threshold=0.85):
        self.lsh = MinHashLSH(threshold=threshold, num_perm=128)
        self.seen = {}
    
    def is_duplicate(self, text: str, doc_id: str) -> bool:
        mh = MinHash(num_perm=128)
        for word in text.split():
            mh.update(word.encode('utf8'))
        
        result = self.lsh.query(mh)
        if result:
            return True  # Duplicate found
        
        self.lsh.insert(doc_id, mh)
        return False
    
    def exact_duplicate(self, file_bytes: bytes) -> bool:
        sha = hashlib.sha256(file_bytes).hexdigest()
        # Check against manifest DB
        return manifest_db.exists(sha)
```

### 6.5 Quality Scoring

Classify whether a document is a real service manual or a consumer quick-start.

```python
# pipeline/quality.py

QUALITY_SIGNALS = {
    # Strong positive signals
    "has_error_codes": 30,     # Error code table present
    "has_wiring_diagram": 20,  # Mentions wiring diagram
    "has_tech_specs": 15,      # Technical specifications section
    "has_parts_list": 15,      # Parts catalog or exploded view
    "page_count_gt_20": 10,    # Real service manuals are long
    "mentions_ohmmeter": 10,   # Technician tool reference
    "mentions_volt_dc": 10,    # Electrical measurement content
    
    # Negative signals
    "only_safety_warnings": -20,  # Consumer safety sheet
    "page_count_lt_5": -30,       # Quick start guide
    "no_technical_content": -25,  # Pure marketing
}

def score_document(extracted: dict) -> tuple[int, str]:
    """Returns (score 0-100, classification)"""
    full_text = " ".join(p["text"] for p in extracted["pages"]).lower()
    score = 50  # Base score
    
    signals = {
        "has_error_codes": bool(re.search(r'error code|fault code|f\d+\s*=', full_text)),
        "has_wiring_diagram": "wiring diagram" in full_text,
        "has_tech_specs": "specifications" in full_text,
        "page_count_gt_20": len(extracted["pages"]) > 20,
        "page_count_lt_5": len(extracted["pages"]) < 5,
        # ... etc
    }
    
    for signal, present in signals.items():
        if present:
            score += QUALITY_SIGNALS.get(signal, 0)
    
    score = max(0, min(100, score))
    classification = "service_manual" if score >= 60 else \
                     "owner_manual" if score >= 30 else "skip"
    return score, classification
```

### 6.6 Update Cadence

Manufacturers release new models each year (typically September–November for US market).

| Trigger | Action | Frequency |
|---------|--------|-----------|
| Scheduled cron (October 1 each year) | Re-scrape manufacturer model indexes; add new models to registry | Annual |
| CPSC recall webhook (if available) or weekly poll | Add new recall records | Weekly |
| Manual trigger (new brand onboarded) | Full brand scrape | As needed |
| User-reported gap ("my model isn't found") | Priority manual add to queue | Real-time |

**Tool:** GitHub Actions cron job or Fly.io scheduled task. Weekly CPSC poll is critical — recalls are safety issues.

---

## 7. Team & Timeline Estimate

### 7.1 Automation vs. Manual Curation

| Task | Automation Level | Notes |
|------|-----------------|-------|
| CPSC + EnergyStar pull | ✅ Fully automated | Day 1 script; 2 hours to build |
| Model registry bootstrap | ✅ Mostly automated | Clean-up of EnergyStar CSV takes ~4 hours |
| Manufacturer PDF download (with ToS approval) | ✅ Automated via Scrapy | 1–2 weeks to build spiders per brand |
| PDF text extraction (native) | ✅ Fully automated | pdfplumber pipeline; 1 week to build |
| OCR for scanned manuals | ✅ Automated (marker-pdf) | Quality review needed for <1985 manuals |
| Section detection / chunking | ✅ Mostly automated | 10–15% manual QA needed for edge cases |
| Quality scoring / classification | ✅ Automated | Human review sample of 200 docs per brand |
| Embedding + ingestion | ✅ Fully automated | Standard OpenAI Batch API pipeline |
| **Manual curation (filling gaps)** | ❌ Manual | Estimate 20% of manuals need manual sourcing |
| Legal clearance per source | ❌ Manual | One-time per source; 1–2 hours each |

### 7.2 Timeline (Solo Founder + AI Tooling)

```
Week 1:
  - Day 1: Pull CPSC recall DB, EnergyStar CSV → load model_registry (Phase 0 foundation)
  - Day 2-3: Build and test Scrapy spider for Whirlpool portal
  - Day 4-5: PDF extraction pipeline (pdfplumber + marker-pdf)

Week 2:
  - Day 1-2: Chunking + embedding pipeline (OpenAI Batch API)
  - Day 3: pgvector setup on Supabase, schema deployment
  - Day 4-5: Ingest first 1,000 Whirlpool dishwasher manuals → verify retrieval quality

Week 3:
  - Whirlpool family complete (dishwasher + washer + dryer + fridge)
  - Phase 0 DONE: model_registry has 200K+ records, recall data loaded
  - Broker demo unblocked

Week 4-6:
  - GE Appliances spider + ingestion
  - Deduplication pipeline

Week 7-9:
  - LG + Samsung (Playwright-based, slower)
  - Quality scoring calibration

Week 10-12:
  - Bosch + Frigidaire/Electrolux
  - Retrieval evaluation — run held-out test questions

Week 13-16:
  - Gap analysis: which models have poor coverage?
  - Manual curation for high-frequency models with no manual found
  - Phase 1 DONE: ~24,000 manuals, 200K+ variants, top 4 categories
  - Consumer diagnostic beta unblocked

Months 5-18:
  - Phase 2: expand categories, update cadence automation
```

### 7.3 Acceleration Options

| Option | Cost | Time Saved | Recommendation |
|--------|------|-----------|----------------|
| Hire a data labeling service (Scale AI, Surge AI) for PDF extraction QC | $500–2,000 | 2–3 weeks | Phase 2 when volume requires it |
| License data from Encompass Parts / Marcone | $5,000–50,000/year | 6+ months | **Strongly evaluate** — if they have 500K model records, this replaces Phase 0 build entirely |
| Hire a 1099 contractor (appliance technician) for quality review | $50–100/hour | Ongoing | 20 hours to calibrate quality scoring; high ROI |
| Use Claude (Anthropic) for section detection and metadata extraction | API costs | 2–3 weeks | Use claude-3-haiku for batch classification — cheap, fast |

---

## 8. Success Criteria

### 8.1 Phase 0 — "Passport Seeding Ready"

| Metric | Target | Measurement |
|--------|--------|-------------|
| Unique normalized model numbers in registry | ≥ 150,000 | `SELECT COUNT(*) FROM model_registry` |
| Make/brand coverage | ≥ 15 major brands | `SELECT COUNT(DISTINCT make) FROM model_registry` |
| Recall data coverage | 100% of CPSC appliance recalls since 2000 | Cross-reference CPSC API total vs. loaded |
| Model lookup latency (p50) | < 50ms | Load test with 100 concurrent lookups |
| Year estimate availability | ≥ 70% of models have year range | `SELECT COUNT(*) WHERE year_start IS NOT NULL` |
| False negative rate (known model not found) | < 5% | Test with 500 real appliance model plates from technician |

**Phase 0 is done when:** Broker scans 20 random appliance model plates in a walk-through demo and gets correct make/model/age/recall status for ≥ 18/20.

### 8.2 Phase 1 — "Consumer Diagnostic Ready"

| Metric | Target | Measurement |
|--------|--------|-------------|
| Service manuals ingested (top 4 categories) | ≥ 24,000 | `SELECT COUNT(*) FROM corpus_documents WHERE doc_type='service_manual'` |
| Model variants covered | ≥ 200,000 | `SELECT COUNT(*) FROM model_registry WHERE doc_id IS NOT NULL` |
| Brand coverage (top 4 brands per category) | Whirlpool, GE, LG, Samsung, Bosch, Frigidaire | Manual audit |
| Retrieval precision @ k=5 (held-out test) | ≥ 0.80 | Evaluation script (see below) |
| Answer accuracy on error code questions | ≥ 85% | GPT-4o judge on 200-question test set |
| Answer accuracy on symptom/diagnostic questions | ≥ 75% | GPT-4o judge on 200-question test set |
| Chunks with no relevant manual (model gap rate) | < 15% | % of user queries that fall back to general LLM knowledge |
| RAG query latency (p95) | < 2 seconds | End-to-end API timing |
| Coverage for scanned/OCR manuals | ≥ 90% extractable | Quality score ≥ 30 |

### 8.3 Corpus Quality Measurement

**Retrieval evaluation script:**

```python
# tests/retrieval_eval.py
"""
Held-out test set: 500 (question, model_number, expected_section) triples.
Questions written by a certified appliance technician.
Example: 
  Q: "What does error code F8E1 mean on a Whirlpool WDT780SAEM?"
  Expected: chunk from Section 4.3 Error Codes, page 42
"""

TEST_QUESTIONS = [
    {
        "question": "What does error code F8E1 mean on a Whirlpool WDT780SAEM1?",
        "model_number": "WDT780SAEM1",
        "expected_section": "Error Codes",
        "expected_content_keywords": ["water", "overflow", "inlet"]
    },
    # ... 499 more
]

async def evaluate_retrieval(questions: list, k: int = 5) -> dict:
    hits = 0
    for q in questions:
        results = await retrieve_chunks(
            query=q["question"],
            model_filter=normalize_model_number(q["model_number"]),
            k=k
        )
        # Check if expected section appears in top-k results
        relevant = any(
            q["expected_section"].lower() in r["section"].lower() or
            any(kw in r["content"].lower() for kw in q["expected_content_keywords"])
            for r in results
        )
        if relevant:
            hits += 1
    
    precision = hits / len(questions)
    return {"precision_at_k": precision, "k": k, "n": len(questions)}
```

**Answer accuracy (GPT-4o judge):**
```python
JUDGE_PROMPT = """
You are evaluating whether an AI appliance diagnostic answer is correct.

Question: {question}
Ground truth (from service manual): {ground_truth}
AI Answer: {ai_answer}

Rate the answer:
- CORRECT: Answer matches ground truth, no safety errors
- PARTIAL: Answer is mostly right but missing key detail
- INCORRECT: Answer is wrong or contradicts service manual
- DANGEROUS: Answer could cause harm if followed

Output JSON: {"rating": "CORRECT|PARTIAL|INCORRECT|DANGEROUS", "reason": "..."}
"""
```

**Minimum bar to ship Phase 1:** Zero DANGEROUS ratings on 200-question test set. This is a hard gate — safety is non-negotiable for appliance diagnostic AI.

---

## Appendix A — Immediate Actions (This Week)

| # | Action | Owner | Blocker | Time Estimate |
|---|--------|-------|---------|--------------|
| 1 | Pull CPSC recall API → load to Supabase | Dev | None | 4 hours |
| 2 | Download EnergyStar product CSV → normalize → load to model_registry | Dev | None | 6 hours |
| 3 | Send license inquiry emails to Whirlpool, GE partner programs | Founder | None | 2 hours |
| 4 | Send inquiry to Encompass Parts / Marcone re: data license | Founder | None | 1 hour |
| 5 | ⚖️ Brief IP attorney on Posture A (embed + cite) approach | Founder | Requires attorney | 2 hours |
| 6 | Set up `homeops-corpus` repo with pipeline skeleton | Dev | None | 3 hours |
| 7 | Deploy pgvector schema to Supabase staging | Dev | None | 2 hours |
| 8 | Download 100 Whirlpool dishwasher PDFs manually → test extraction pipeline | Dev | None | 4 hours |

**Total: Phase 0 foundation is achievable in Week 1 (CPSC + EnergyStar alone = broker demo ready).**

---

## Appendix B — Source Quick Reference

| Need | Go To First |
|------|------------|
| Model lookup (Phase 0) | EnergyStar CSV + CPSC API |
| Recall status | CPSC API (`recalls.gov/api`) |
| Service manuals (Whirlpool family) | `producthelp.whirlpool.com` — ⚖️ get license |
| Service manuals (GE) | `geappliances.com/service` — ⚖️ get license |
| Error codes (quick reference) | `applianceaid.com` — review ToS |
| Open-licensed repair content | `ifixit.com/api` — CC BY-NC-SA |
| Failure frequency data | `openrepair.data.repair` — CC BY 4.0 |
| Bulk model data broker | Encompass Parts — call first |

---

*Document maintained by HomeOps founder. Update this document when a new source is evaluated, a legal decision is made, or a phase threshold is crossed.*
