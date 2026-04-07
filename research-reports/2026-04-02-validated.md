# BookLib Validated Research Report — 2026-04-02

**Findings reviewed:** 7
**DUPLICATE (already covered):** 4 | **New findings validated:** 3
**✅ Validated:** 1 | **⚠️ Partially validated:** 2 | **❌ Rejected:** 0

> **Note:** The research scan incorrectly claimed "First report — no prior reports to deduplicate." In fact, there are validated reports from 2026-03-31 and 2026-04-01 with overlapping findings. Four of today's seven findings are duplicates.

---

## DUPLICATE FINDINGS (skip full validation)

### Finding 1: SEE Early-Exit Cross-Encoder Reranking
**DUPLICATE — already covered on 2026-04-01 (Finding 2).** ⚠️ Partially Validated, filed as P3 Backlog in IDEAS.md. Assessment unchanged: paper is top-tier (SIGIR 2025) but implementation is PyTorch/GPU-only, no ONNX path, and BookLib has no cross-encoder yet. Premature.

### Finding 4: Transformers.js v4 — 4x Embedding Speedup
**DUPLICATE — already covered on 2026-04-01 (Finding 1).** ✅ Validated, filed as 🔥 Hot P1 in IDEAS.md. Assessment unchanged: lowest-risk, highest-impact upgrade.
**Implementation note:** Code inspection shows `indexer.js` and `searcher.js` now import from `@huggingface/transformers` (v4 package name) but still reference `'Xenova/all-MiniLM-L6-v2'` model ID. The model ID update to `onnx-community/all-MiniLM-L6-v2-ONNX` appears incomplete. This should be flagged as a partial migration.

### Finding 6: Codified Context Three-Tier Architecture
**DUPLICATE — already covered on 2026-03-31 (Finding 3).** ✅ Validated for internal framing, ❌ Rejected for user-facing citation (single-author preprint, source quality 2/5). No new information in today's research scan.

### Finding 7: OPENDEV Lazy Tool Discovery + Model Routing
**DUPLICATE — already covered on 2026-04-01 (Finding 4).** ⚠️ Partially Validated, filed as 📋 Backlog P2 in IDEAS.md. Assessment unchanged: good design pattern, but system paper not controlled experiment.

---

## NEW FINDINGS — Full Validation

---

## Finding 2: Practical GraphRAG — Dependency-Parsed KG + Hybrid Retrieval — ⚠️ PARTIALLY VALIDATED

**Source quality:** 3/5 (arXiv preprint, NOT peer-reviewed. 6 authors from an enterprise research team. July 2025, revised Dec 2025. No venue acceptance. No open-source code found.)

**Claims verified:**
- ✅ Paper is real: arxiv:2507.03226, proper submission history and DOI
- ✅ Authors: Min, Bansal, Pan, Keshavarzi, Mathew, Kannan — enterprise research team
- ✅ Dependency-parsing KG construction achieves 94% of LLM-based quality (61.87% vs 65.83%) — confirmed in abstract
- ✅ Hybrid retrieval using RRF with multi-granular embeddings — confirmed
- ✅ 15% improvement over vanilla vector baselines on enterprise code migration datasets — confirmed
- ⚠️ No open-source implementation found — reproducibility concern
- ⚠️ Evaluated on enterprise legacy code migration datasets only — domain transfer to programming skills is unproven

**Technical feasibility CONCERNS:**
- ⚠️ **Design conflict:** BookLib's Spec 3 explicitly chose manual KG capture (`booklib capture`) over auto-ingestion. The roadmap states: "Auto-ingestion from sessions produces uncurated nodes." Dependency-parsing-based auto-extraction contradicts this deliberate design decision.
- ⚠️ **RRF already implemented:** BookLib already has `lib/engine/rrf.js` with reciprocal rank fusion. The hybrid retrieval component is not new.
- ⚠️ **Multi-granular embeddings (entities, edges, chunks) would require 3 separate vector indices** — significant complexity increase for a 22-skill corpus. This approach shines at enterprise scale (thousands of documents), not BookLib's current size.
- ⚠️ **Dependency parsing in Node.js** is possible (compromise.js, nlp.js) but quality is lower than Python's spaCy. The 94% quality claim likely uses Python NLP tools.
- ✅ The paper validates that you DON'T need LLMs for KG construction — useful data point if BookLib ever revisits auto-extraction.

**Competitive value:** LOW for current roadmap. BookLib's differentiator is curated, manual knowledge capture — not auto-extracted KGs. The 15% improvement benchmark is on a very different domain (enterprise code migration vs. programming skills).

**Project alignment:** Spec 3, but contradicts the manual-capture-only design decision. The only transferable insight is: "if you ever do auto-extraction, use dep parsing, not LLMs."

**Verdict: ⚠️ PARTIALLY VALIDATED** — The paper is real and the technique is sound, but the research report significantly overstated alignment with BookLib. The core insight (dep parsing ≈ LLM extraction at 6% quality cost) is useful as a data point for future Spec 4 work, but conflicts with Spec 3's intentional manual-capture-only design. RRF is already implemented. Multi-granular embeddings add complexity disproportionate to BookLib's corpus size. File as a long-term reference, not an actionable item.

**Priority:** P3 (reference only) | **Effort:** High (if ever implemented) | **Spec:** Future Spec 4

---

## Finding 3: ConTEB + InSeNT Contextual Chunk Embeddings — ⚠️ PARTIALLY VALIDATED

**Source quality:** 4/5 (arXiv preprint, status "Under Review." 6 authors from EPFL + Illuin Technology — reputable institutions. May 2025. Open-source code at github.com/illuin-tech/contextual-embeddings. Pre-trained models on HuggingFace.)

**Claims verified:**
- ✅ Paper is real: arxiv:2505.24782, proper submission history
- ✅ Authors: Conti, Faysse, Viaud, Bosselut, Hudelot, Colombo — EPFL + Illuin Technology
- ✅ ConTEB benchmark introduced — evaluates context-dependent retrieval scenarios
- ✅ SOTA embedding models fail when document-wide context is needed — confirmed in abstract
- ✅ InSeNT (In-Sequence Negative Training) + late chunking improves contextual embeddings — confirmed
- ✅ Open-source code exists at github.com/illuin-tech/contextual-embeddings — confirmed, includes training scripts
- ✅ Pre-trained models available: `illuin-conteb/modernbert-large-insent` and `illuin-conteb/modern-colbert-insent`

**Technical feasibility CONCERNS:**
- ❌ **Models are PyTorch/Sentence-Transformers only — no ONNX export available.** BookLib requires ONNX for transformers.js inference. Custom ONNX export of ModernBERT-large would be needed.
- ❌ **Model size problem:** ModernBERT-large is ~395M params — roughly 12x larger than all-MiniLM-L6-v2 (33M). This blows past BookLib's CPU-only, <500ms latency target. Even quantized to q4, it would be ~250MB and far too slow for CLI search.
- ❌ **InSeNT is a training method, not a drop-in improvement.** You'd need to fine-tune a model with InSeNT loss. BookLib uses off-the-shelf models and has no training infrastructure.
- ⚠️ **Late chunking component overlaps with existing backlog idea** from 2026-03-31 (Late Chunking via jina-embeddings-v2-small-en, filed as 📋 Backlog P2). The ConTEB paper validates the importance of late chunking but doesn't provide a new, smaller model suitable for BookLib.
- ✅ The ConTEB benchmark itself is useful as an evaluation tool — could be used to test BookLib's retrieval quality on context-dependent queries.

**What's actually new vs. what's duplicate:**
- Late chunking concept → DUPLICATE of 2026-03-31 idea
- InSeNT training method → NEW but not feasible (requires fine-tuning infrastructure + large models)
- ConTEB benchmark → NEW and potentially useful for evaluation, but not a feature

**Competitive value:** LOW for implementation, MEDIUM for evaluation. The benchmark validates that contextual embeddings matter (which BookLib already knows from the late chunking research). But BookLib can't use the specific models or training method.

**Project alignment:** Spec 2 (embedding pipeline). Reinforces the existing Late Chunking backlog item but doesn't change its priority or feasibility assessment.

**Verdict: ⚠️ PARTIALLY VALIDATED** — The research is real, well-sourced, and the benchmark is valuable. But for BookLib specifically: (1) InSeNT requires model fine-tuning infrastructure BookLib doesn't have, (2) the pre-trained models are 12x too large for CPU inference, (3) the late chunking insight is already captured in the backlog. The only new actionable takeaway is that the ConTEB benchmark could be used to evaluate BookLib's retrieval quality once late chunking is eventually implemented.

**Priority:** P3 (reference for existing Late Chunking idea) | **Effort:** N/A (not directly implementable) | **Spec:** 2

---

## Finding 5: AGENTS.md Empirical Impact Study — ✅ VALIDATED

**Source quality:** 3.5/5 (arXiv preprint, NOT peer-reviewed. 6 authors from multiple universities — Lulla, Mohsenimofidi, Galster, Zhang, Baltes, Treude. January 2026, revised March 2026. Short paper (5 pages). Empirical study across 10 repos and 124 PRs — real data, not theoretical.)

**Claims verified:**
- ✅ Paper is real: arxiv:2601.20404, proper submission history
- ✅ Authors from recognized institutions — multi-university collaboration
- ✅ 28.64% median runtime reduction with AGENTS.md present — confirmed in abstract
- ✅ 16.58% fewer output tokens — confirmed
- ✅ Comparable task completion rates — confirmed ("maintaining similar task completion outcomes")
- ✅ Tested on 10 repositories with 124 PRs — confirmed
- ⚠️ Only 5 pages — relatively thin methodology section. The study measures correlation, not causation. AGENTS.md repos may differ from non-AGENTS.md repos in other ways (e.g., better-maintained repos are more likely to have AGENTS.md files AND be easier for agents).

**Distinction from ETH Zurich study (2026-04-01, Finding 3):**
- **ETH Zurich (arxiv:2602.11988):** LLM-*generated* context files HURT performance and increase cost 20%+
- **This paper (arxiv:2601.20404):** Human-authored AGENTS.md files HELP — 28% faster, 16% fewer tokens

These are complementary findings telling a coherent story: **structured, human-curated agent context helps; auto-generated bloat hurts.** This directly validates BookLib's philosophy of curated skills over auto-generated context.

**Technical feasibility:**
- ✅ This is primarily a positioning/documentation finding — zero implementation risk
- ✅ The specific benchmarks (28% runtime, 16% tokens) are quotable in BookLib's README and pitch materials
- ✅ Aligning `booklib init` output format with conventions this study found effective is low-effort
- ✅ Reinforces the existing "Research-backed skill content guidelines" idea from 2026-04-01

**Competitive value:** MEDIUM — Provides additional empirical ammunition for BookLib's value proposition. Combined with the ETH Zurich study, this creates a two-paper evidence base: curated context helps, auto-generated context hurts. BookLib's structured XML format forces curation.

**Project alignment:** Core + Spec 1. Directly reinforces existing "Research-backed skill content guidelines" idea. Should UPDATE that existing entry rather than create a new one.

**Verdict: ✅ VALIDATED** — Despite being a short preprint, the empirical methodology (10 repos, 124 PRs, measurable outcomes) provides useful data. The key insight — that human-curated agent context files measurably improve efficiency — is BookLib's core thesis. The 28%/16% numbers are citable. However, the actionable work overlaps almost entirely with the existing "Research-backed skill content guidelines" idea from 2026-04-01. This finding reinforces and strengthens that idea rather than creating a new feature.

**Priority:** P1 (documentation update — merge into existing idea) | **Effort:** 0 additional (already planned) | **Spec:** Core + Spec 1

### Additions to existing "Research-backed skill content guidelines" idea:

- Cite arxiv:2601.20404 alongside arxiv:2602.11988 in skill authoring docs
- Two-paper narrative: "Human-curated context helps (28% faster); auto-generated context hurts (20%+ cost increase)"
- Use the 28.64% / 16.58% numbers in README positioning
- Consider aligning `booklib init` output with the conventions this study found most effective

---

## Summary Table

| # | Finding | Status | Source Quality | Priority | Effort |
|---|---------|--------|---------------|----------|--------|
| 1 | SEE early-exit reranking | DUPLICATE (2026-04-01) | 5/5 | P3 | 2-3 weeks |
| 2 | Practical GraphRAG | ⚠️ Partial | 3/5 | P3 (reference) | High |
| 3 | ConTEB + InSeNT contextual embeddings | ⚠️ Partial | 4/5 | P3 (reference) | N/A |
| 4 | Transformers.js v4 | DUPLICATE (2026-04-01) | 5/5 | P1 | 0.5-1 day |
| 5 | AGENTS.md empirical impact | ✅ Validated | 3.5/5 | P1 (merge) | 0 additional |
| 6 | Codified Context | DUPLICATE (2026-03-31) | 2/5 | — | — |
| 7 | OPENDEV lazy discovery | DUPLICATE (2026-04-01) | 3/5 | P2 | 1 day |

## Cross-Cutting Analysis

**Today's scan was mostly rehash.** 4 of 7 findings were duplicates from the previous two days. The research scanner's deduplication logic appears broken — it claimed "First report — no prior reports to deduplicate against" despite two prior reports existing. This should be fixed in the scanner configuration.

**The one genuinely validated finding (Finding 5) reinforces existing work** rather than opening a new direction. The AGENTS.md empirical study (arxiv:2601.20404) strengthens the "Research-backed skill content guidelines" idea already in the backlog by adding a second paper with complementary evidence.

**Findings 2 and 3 are interesting research but not actionable for BookLib today:**
- Practical GraphRAG contradicts BookLib's manual-capture design decision
- ConTEB/InSeNT requires training infrastructure and models too large for CPU inference

**Net new actionable items from today: zero.** All validated work maps to updating existing IDEAS.md entries. This is not a bad outcome — it means the backlog is well-targeted and today's research confirms existing priorities rather than distracting from them.

## Implementation note discovered during validation

While inspecting the codebase, I noticed that `lib/engine/indexer.js` and `lib/engine/searcher.js` import from `@huggingface/transformers` (v4 package) but still reference the old model ID `'Xenova/all-MiniLM-L6-v2'` instead of `'onnx-community/all-MiniLM-L6-v2-ONNX'`. The Transformers.js v4 migration appears partially complete. The 🔥 Hot P1 item in IDEAS.md should be updated to note this.

---
*Validated by daily-research-validator on 2026-04-02.*
