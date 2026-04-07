# BookLib Validated Research Report — 2026-03-31

**Findings reviewed:** 6
**✅ Validated:** 3 | **⚠️ Partially validated:** 2 | **❌ Rejected:** 1

---

## Finding 1: Late Chunking — ⚠️ PARTIALLY VALIDATED

**Source quality:** 4/5 (Jina AI research team, arxiv preprint updated July 2025, reproducible with open code at github.com/jina-ai/late-chunking)

**Claims verified:**
- ✅ Paper is real (arxiv:2409.04701v3), authored by Jina AI researchers
- ✅ +24.47% improvement on LongEmbed benchmark — confirmed in paper
- ✅ `Xenova/jina-embeddings-v2-small-en` exists on HuggingFace with ONNX weights (fp32, fp16, q8, q4)
- ✅ Supports 8192 token context window — confirmed
- ✅ No additional training required — confirmed

**Technical feasibility concern:**
- ⚠️ Late chunking requires access to **token-level embeddings BEFORE pooling**. The standard transformers.js `pipeline('feature-extraction')` returns already-pooled output by default. To implement late chunking, BookLib would need to either (a) use the model directly without the pipeline abstraction to get raw token outputs, or (b) pass `pooling: false` and handle chunked mean pooling manually. This is doable but adds complexity — it's not the "drop-in" replacement the research scan suggested.
- ⚠️ Switching from `all-MiniLM-L6-v2` (33M params, 512 tokens) to `jina-embeddings-v2-small-en` (33M params, 8192 tokens) means **re-indexing the entire library** and all existing indices become incompatible. Migration path needed.
- ✅ CPU inference is feasible — similar model size to current MiniLM.
- ✅ Latency should be acceptable for indexing (one-time cost). Search latency unchanged since queries are still single embeddings.

**Verdict: ⚠️ PARTIALLY VALIDATED** — The technique is real and impactful, but the research scan overstated how easy it is to implement. Requires custom pooling logic in transformers.js and a full re-index migration. Still worth pursuing for Spec 2, but as a Phase 2 enhancement after hybrid search is working, not a quick win.

**Priority:** P2 | **Effort:** ~3-5 days | **Spec:** 2
**Files:** `lib/engine/indexer.js`, `lib/engine/searcher.js`

---

## Finding 2: SRAG (Structured Metadata Enrichment) — ✅ VALIDATED

**Source quality:** 3/5 (arxiv preprint 2603.26670, March 2026 — recent, but not yet peer-reviewed or accepted at a venue)

**Claims verified:**
- ✅ Paper exists on arxiv, describes prepending structured tags to chunk text before embedding
- ✅ 30% improvement in QA scores (GPT-5 as judge, p-value = 2e-13) — statistically significant
- ✅ Strongest gains on comparative, analytical, and predictive queries
- ✅ Requires NO architectural changes — no graph databases, no hybrid retrievers needed
- ✅ Works with existing vector search infrastructure

**Technical feasibility:**
- ✅ Trivially implementable in BookLib. `parseSkillFile()` already extracts XML tag types and metadata. Prepending `[skill:effective-kotlin] [type:anti_patterns] [tags:null-safety]` to each chunk's text before calling `getEmbedding()` is a ~20-line change in `indexer.js`.
- ✅ No new dependencies required.
- ✅ Compatible with current `all-MiniLM-L6-v2` model — no model swap needed.
- ⚠️ Requires re-indexing (one-time), but that's already expected for any Spec 2 changes.
- ✅ BookLib's XML-tagged skill format is genuinely unique — flat markdown on skills.sh cannot replicate this.

**Verdict: ✅ VALIDATED** — This is the highest-value, lowest-risk finding. BookLib already has the structured metadata that SRAG requires. The implementation is minimal, the improvement is statistically significant, and it directly addresses the cross-domain noise problem identified in thoughts.md. Should be implemented BEFORE hybrid search — it improves the existing pure vector pipeline immediately.

**Priority:** P1 (implement first) | **Effort:** ~1 day | **Spec:** 2
**Files:** `lib/engine/indexer.js`, `lib/engine/parser.js`

### Feature Proposal: Structured Metadata Prefix Embeddings

**Title:** Prepend structured skill metadata to chunks before embedding (SRAG approach)

**Description:** Modify the indexing pipeline to prepend structured metadata tags — skill name, chunk type (from XML tags), and language/domain tags — to each chunk's text before generating its embedding vector. This encodes domain separation directly into the vector space, reducing cross-skill noise in search results.

**Acceptance criteria:**
- Each chunk's embedding text is prefixed with `[skill:{name}] [type:{xml_tag}] [tags:{comma-separated}]`
- `parseSkillFile()` extracts and passes metadata to the indexer
- Existing `booklib search` returns results with measurably less cross-domain contamination
- Benchmark eval (when built in Spec 2) shows precision improvement over baseline
- Re-index command works cleanly with new prefix format

**Files to modify:** `lib/engine/indexer.js`, `lib/engine/parser.js`
**Dependencies:** None
**Blockers:** None — can be implemented independently of Spec 2 hybrid pipeline

---

## Finding 3: Codified Context Paper — ✅ VALIDATED

**Source quality:** 2/5 (arxiv preprint 2602.20478, Feb 2026, single author, NOT peer-reviewed, no venue acceptance yet. Based on one 108K-line project — limited generalizability.)

**Claims verified:**
- ✅ Paper exists, describes a three-component system (hot memory, domain agents, cold memory)
- ✅ 283 development sessions with quantitative metrics — real data, not theoretical
- ✅ The taxonomy genuinely maps to BookLib: skills = hot memory, reviewer agents = domain experts, knowledge graph = cold memory
- ⚠️ Single author, single project, not peer-reviewed — the evidence is observational, not experimental
- ⚠️ GitHub repo exists (arisvas4/codified-context-infrastructure) but it's a reference implementation, not widely adopted

**Technical feasibility:** N/A — this is a positioning/marketing recommendation, not a code change.

**Verdict: ✅ VALIDATED** — Despite the weak source quality (single-author preprint), the architectural mapping to BookLib is genuine and useful. The value here is framing, not implementation. Citing this paper in RESEARCH.md and README positions BookLib within an emerging academic conversation. Low effort, meaningful positioning upside. Just don't oversell it — say "aligns with" rather than "validated by."

**Priority:** P2 | **Effort:** ~2 hours | **Spec:** 3
**Files:** `README.md`, `benchmark/RESEARCH.md` (when created)

---

## Finding 4: KG²RAG (Graph-Guided Chunk Organization) — ⚠️ PARTIALLY VALIDATED

**Source quality:** 5/5 (arxiv:2502.06864, accepted at NAACL 2025 — top NLP venue. Open GitHub implementation at github.com/nju-websoft/KG2RAG)

**Claims verified:**
- ✅ Paper is real, published at NAACL 2025 (top venue)
- ✅ Uses KG for fact-level relationships between chunks — confirmed
- ✅ Chunk expansion + chunk organization approach — confirmed
- ✅ Evaluated on HotpotQA with positive results

**Technical feasibility concern:**
- ⚠️ **Critical gap:** KG²RAG assumes a large, pre-existing knowledge graph (like Wikidata) with dense entity coverage. BookLib's knowledge graph is manually curated via `booklib capture` and currently has very few nodes. The chunk expansion step relies on graph density — with a sparse graph, expansion returns little or nothing.
- ⚠️ The paper's evaluation uses HotpotQA (Wikipedia-scale KG). BookLib's domain (programming books) has no comparable pre-built KG to leverage.
- ✅ The chunk *organization* step (ordering by graph distance) is applicable regardless of graph density and adds value even with BookLib's sparse graph.

**Verdict: ⚠️ PARTIALLY VALIDATED** — The paper is top-tier (NAACL), but the chunk expansion approach doesn't transfer well to BookLib's sparse, manually-curated graph. The chunk organization idea (ordering results by graph distance) is the only directly applicable piece. Defer the full KG²RAG approach until Spec 3's `booklib capture` has built meaningful graph density. For now, only adopt the result ordering component.

**Priority:** P3 | **Effort:** ~1 day (ordering only) | **Spec:** 3
**Files:** `lib/engine/graph-injector.js`, `lib/engine/searcher.js`

---

## Finding 5: MCP Server Cards — ✅ VALIDATED

**Source quality:** 4/5 (official MCP roadmap blog post + active GitHub proposal SEP-1649. Not a research paper, but direct from the spec maintainers.)

**Claims verified:**
- ✅ MCP Server Cards are a real proposal (SEP-1649) on the official MCP GitHub
- ✅ Part of the 2026 roadmap, confirmed by the official MCP blog
- ⚠️ NOT yet merged into the core spec — still a proposal under review
- ✅ Uses `.well-known/mcp/server-card.json` path convention
- ✅ BookLib's Spec 1 already plans `.well-known/skills/` — compatible pattern

**Technical feasibility:**
- ✅ Generating a JSON file in CI is trivial
- ⚠️ The Server Card format may change before finalization — implement against the current SEP-1649 draft but expect to update
- ✅ No new dependencies

**Verdict: ✅ VALIDATED** — Low risk, low effort, high visibility payoff. The spec may evolve, but the `.well-known` convention is stable. Implement it alongside the existing `booklib build-wellknown` command. Even if Server Cards change format, the work to generate BookLib's MCP metadata is reusable.

**Priority:** P2 | **Effort:** ~0.5 days | **Spec:** 1
**Files:** `scripts/` or CI pipeline, `docs/.well-known/`

---

## Finding 6: Malicious Skills / Skill Supply Chain Security — ❌ REJECTED (as originally framed)

**Source quality:** 5/5 (Snyk security research, The Hacker News coverage, multiple independent confirmations. The ClawHavoc campaign is well-documented.)

**Claims verified:**
- ✅ 341 malicious skills found on ClawHub — confirmed by Snyk and The Hacker News
- ✅ 36% of skills had at least one security flaw — confirmed (Snyk ToxicSkills study)
- ✅ Prompt injection + data exfiltration attacks are real threat vectors
- ✅ This is a genuine ecosystem problem

**Why rejected (as framed):**
- ❌ The research scan framed this as "add a static analysis pass to skill-fetcher.js." But the Snyk research shows that 91% of malicious samples combine prompt injection with traditional malware — **static pattern matching is insufficient**. Checking for "URLs in skill text" or "base64-encoded content" would catch only the most trivial attacks and give false confidence.
- ❌ A proper skill verification system requires: sandboxed execution analysis, prompt injection detection models, or community trust scoring. This is a significant engineering effort, not a "medium effort" feature.
- ❌ Building a security scanner that catches only 10% of threats is worse than having no scanner — it creates false trust.

**Reframed recommendation:** Instead of a verifier, consider a lighter approach: (1) display a clear warning when fetching community skills: "Unverified community skill — review before using", (2) add a `--trusted` flag that limits fetches to curated sources only, (3) document skill security best practices. This is honest and useful without overpromising.

**Priority:** P3 (warning/trust approach) | **Effort:** ~0.5 days for warnings, much more for real scanning | **Spec:** 1
**Files:** `lib/skill-fetcher.js`

---

## Summary Table

| # | Finding | Verdict | Source Quality | Priority | Effort |
|---|---------|---------|---------------|----------|--------|
| 1 | Late Chunking | ⚠️ Partial | 4/5 | P2 | 3-5 days |
| 2 | SRAG Metadata Prefixes | ✅ Validated | 3/5 | **P1** | **1 day** |
| 3 | Codified Context positioning | ✅ Validated | 2/5 | P2 | 2 hours |
| 4 | KG²RAG chunk organization | ⚠️ Partial | 5/5 | P3 | 1 day |
| 5 | MCP Server Cards | ✅ Validated | 4/5 | P2 | 0.5 days |
| 6 | Skill security scanner | ❌ Rejected | 5/5 | P3 | 0.5 days (warnings only) |

## Recommended Implementation Order

1. **SRAG metadata prefixes** (P1) — highest value-to-effort ratio, no dependencies
2. **MCP Server Cards** (P2) — quick win for Spec 1 visibility
3. **Codified Context citation** (P2) — 2-hour positioning win
4. **Late Chunking** (P2) — after Spec 2 hybrid pipeline is stable
5. **KG²RAG ordering** (P3) — after Spec 3 graph has more nodes
6. **Skill trust warnings** (P3) — lightweight safety layer for Spec 1
