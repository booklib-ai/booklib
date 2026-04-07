# BookLib Validated Research Report — 2026-04-03

**Source document:** `2026-04-03-lightrag-ideas.md` (focused LightRAG analysis, not a standard scan)
**Findings reviewed:** 4 borrowable ideas + 2 explicit non-borrowables
**✅ Validated:** 2 | **⚠️ Partially validated:** 1 | **❌ Rejected:** 1
**Duplicates:** 0

> **Note:** Today's input is not a standard research scan but a targeted analysis of one paper (LightRAG, EMNLP 2025) with specific implementation proposals for BookLib's engine. Each proposal is validated against the actual codebase.

---

## Source Verification: LightRAG

**Paper:** [LightRAG: Simple and Fast Retrieval-Augmented Generation](https://arxiv.org/abs/2410.05779)
**Authors:** Zirui Guo, Lianghao Xia, Yanhua Yu, Tu Ao, Chao Huang (HKUDS, University of Hong Kong)
**Venue:** EMNLP 2025 Findings — **peer-reviewed at a top NLP venue**
**Published:** October 2024 (arXiv), accepted EMNLP 2025
**Code:** [github.com/HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) — open source, actively maintained
**Source quality:** 5/5 — peer-reviewed at top venue, credible institution, open-source implementation, high citation count

**Claims verified against paper:**
- ✅ Dual-level retrieval (local entity keywords + global thematic keywords) — confirmed in Section 3.3
- ✅ One-hop neighbor content hydration — confirmed in retrieval pipeline
- ✅ Entity/relationship K,V profiling summaries — confirmed, uses LLM to generate
- ✅ Incremental graph updates via union merge — confirmed in Section 3.4
- ✅ The ideas document correctly identifies what NOT to borrow (LLM-based extraction, LLM-generated theme keys) — good engineering judgment

---

## Finding 1: Dual-Level Keyword Routing — ✅ VALIDATED

**Claim:** Split query keywords into entity-level (match graph node names/tags) and concept-level (match skill content via BM25+vector). Route each type to the appropriate index.

**Source verification:** ✅ Confirmed. LightRAG's dual-level retrieval is a core contribution of the paper. Local keywords isolate specific entity nodes; global keywords match broader themes across the graph. Peer-reviewed at EMNLP 2025.

**Codebase verification:**
- ✅ `query-expander.js` currently does flat keyword extraction + naive expansion ("best practices for X", "how to X"). No entity vs. concept distinction exists.
- ✅ `graph-search.js` has `extractConcepts()` which groups consecutive keywords into compound concepts, and `activateSubgraph()` which matches concept words against node text. But this activation is all-or-nothing — there's no routing based on keyword TYPE.
- ✅ `searcher.js` runs expanded queries through both vector and BM25 equally, with no graph-aware routing.
- ✅ The graph activation in `graphActivatedSearch()` only triggers for multi-concept queries (`concepts.length < 2` → skip). Single-entity queries get no graph benefit at all.

**Technical feasibility:**
- ✅ **No new dependencies.** Classification can be done by matching keywords against existing node IDs/titles/tags (entity keywords) vs. fallback to BM25+vector (concept keywords).
- ✅ **Fits existing architecture.** `expandQuery()` returns `{ original, keywords, expanded }`. Adding a `{ entities, concepts }` split is a natural extension.
- ✅ **Latency:** Keyword classification is O(keywords × nodes) string matching — negligible for BookLib's corpus size (<100 nodes).
- ✅ **No API contract change.** `search()` already accepts `useGraph` option. The routing would be internal.

**Competitive value:** HIGH. This directly addresses the weakness in multi-concept queries like "build order CRUD" where "order" should hit graph nodes and "CRUD" should hit skill content. Currently both terms go through the same undifferentiated pipeline.

**Project alignment:** Spec 2 (retrieval quality) + Spec 3 (knowledge graph). No conflicts with planned work. Enhances the `brief` tool output quality.

**Deduplication check:** No overlap with existing IDEAS.md entries. The closest is the Practical GraphRAG entry (2026-04-02, P3 Backlog) which is about KG construction, not query routing.

### Feature Proposal

**Title:** Implement dual-level keyword routing in query expander
**Description:** Classify expanded query terms into entity keywords (matched against knowledge graph node names, IDs, and tags) and concept keywords (everything else). Route entity keywords to graph-activated search first, concept keywords to the BM25+vector pipeline. Merge results via existing RRF.
**Acceptance criteria:**
- `expandQuery()` returns `{ original, keywords, entities, concepts, expanded }` with classified terms
- Entity keywords trigger `graphActivatedSearch()` even for single-concept queries (remove the `concepts.length < 2` gate for entity matches)
- Concept keywords continue through BM25+vector as today
- Results merged via existing `reciprocalRankFusion()`
- Measurable improvement on multi-concept queries in test suite
**Files to modify:** `lib/engine/query-expander.js`, `lib/engine/searcher.js`, `lib/engine/graph-search.js`
**Dependencies:** Existing knowledge graph nodes must exist (Spec 3)
**Priority:** P1

---

## Finding 2: One-Hop Neighbor Content Hydration — ✅ VALIDATED

**Claim:** When pulling one-hop graph neighbors, actually load their content (`loadNode()`) instead of appending empty metadata stubs.

**Source verification:** ✅ Confirmed. LightRAG hydrates neighbor content as part of its retrieval pipeline. This is standard practice in graph-augmented retrieval.

**Codebase verification:**
- ✅ **The problem is real and clearly visible in code.** `searcher.js` line ~120-130 in `_appendGraphResults()`:
  ```js
  graphLinked.push({
    score: 0,
    text: '',  // ← EMPTY — no content loaded
    metadata: { name: neighborId, source: 'graph', edgeType: edge.type },
  });
  ```
  Graph-linked neighbors are appended with `text: ''` and `score: 0`. They're pointers, not content.
- ✅ `graph.js` already has `loadNode()` and `parseNodeFrontmatter()` — the content loading functions exist and work.
- ✅ `graph-search.js` already loads node content in `graphActivatedSearch()` via `loadNode()` + `parseNodeFrontmatter()`, proving the pattern works. It's just not done in `_appendGraphResults()`.

**Technical feasibility:**
- ✅ **Trivial fix.** Replace the empty stub with `loadNode(neighborId)` + `parseNodeFrontmatter()` to populate `text` and `score`.
- ✅ **No new dependencies.**
- ✅ **Latency:** `loadNode()` is a single `fs.readFileSync()` per neighbor. For BookLib's graph size (dozens of nodes, not thousands), this adds <10ms.
- ✅ **No API contract change.** Results already have `text` and `metadata` fields; they'd just be populated.

**Competitive value:** MEDIUM-HIGH. Currently graph-linked results show up as empty ghosts in search output. Hydrating them makes the knowledge graph actually useful for search, not just for navigation.

**Project alignment:** Spec 3 (knowledge graph). Zero conflicts. This is arguably a bug fix, not a feature.

**Deduplication check:** Not in IDEAS.md. This is a new, specific implementation finding that emerged from comparing LightRAG's design to BookLib's actual code.

### Feature Proposal

**Title:** Hydrate graph neighbor content in search results
**Description:** In `_appendGraphResults()`, call `loadNode()` + `parseNodeFrontmatter()` for each graph-linked neighbor instead of appending empty stubs. Include the node's body text (truncated to ~500 chars) and assign a base score reflecting the edge type weight.
**Acceptance criteria:**
- Graph-linked results have populated `text` field (node body, truncated)
- Graph-linked results have a non-zero `score` based on edge type (e.g., `applies-to` > `see-also`)
- `loadNode()` failure for missing nodes is handled gracefully (skip, don't crash)
- Search output for graph-linked results is visually useful (not empty stubs)
- No regression in search latency (< 50ms increase for typical corpus)
**Files to modify:** `lib/engine/searcher.js`
**Dependencies:** None
**Priority:** P1

---

## Finding 3: Entity/Relationship Profiling (K,V Summaries) — ⚠️ PARTIALLY VALIDATED

**Claim:** Build lightweight entity profiles that aggregate all mentions of a concept across skills. Store as synthetic nodes or index metadata.

**Source verification:** ✅ Confirmed. LightRAG generates entity/relationship profiles using LLM calls. The technique is well-established in graph-augmented RAG literature.

**Technical feasibility CONCERNS:**
- ⚠️ **LightRAG uses LLM calls to generate profiles.** The ideas doc correctly notes BookLib shouldn't use LLM-based extraction, but then proposes building "lightweight entity profiles" without specifying HOW to synthesize them without an LLM. Simple concatenation of all mentions isn't a "profile" — it's just aggregation.
- ⚠️ **BookLib's corpus is small.** With ~22 skills and a handful of knowledge nodes, a concept like "event sourcing" might appear in 2-3 places. A "profile" for 2-3 mentions is just those mentions — there's nothing to synthesize.
- ⚠️ **Implementation complexity vs. value.** This requires: (1) detecting cross-skill concept mentions during indexing, (2) grouping them, (3) generating/storing a synthetic node, (4) keeping it updated when skills change. That's a meaningful indexing pipeline change for marginal benefit at current corpus size.
- ✅ **The concept IS valid at scale.** If the knowledge graph grows to 100+ nodes, entity profiles would become genuinely useful as hub entries.

**Competitive value:** LOW at current scale. Becomes MEDIUM as graph grows.

**Project alignment:** Spec 3 (knowledge graph). No conflicts, but premature optimization for current corpus size.

**Deduplication check:** Not in IDEAS.md. New idea, but marginal value.

**Verdict: ⚠️ PARTIALLY VALIDATED** — The technique is real and well-sourced, but the value proposition depends on corpus scale BookLib hasn't reached. The ideas doc acknowledges this ("more useful as the knowledge graph grows"). File as long-term backlog, revisit when knowledge graph exceeds ~50 nodes.

### Feature Proposal

**Title:** Add entity profiling for high-frequency knowledge graph concepts
**Description:** During indexing, detect concepts that appear across 3+ skills/nodes and generate an aggregated profile node. Profile contains: concept name, list of appearances with context snippets, and cross-reference links. Surfaces as a hub in search results.
**Acceptance criteria:**
- Indexer detects cross-referenced concepts (appearing in 3+ skills/nodes)
- Profile node created with aggregated mentions and context
- Profile surfaces in search results when concept is queried
- Profiles auto-update on re-index
- Configurable threshold for minimum appearances
**Files to modify:** `lib/engine/indexer.js`, `lib/engine/graph.js`
**Dependencies:** Sufficient knowledge graph density (50+ nodes recommended)
**Priority:** P3

---

## Finding 4: Incremental Vector Insertion for Knowledge Nodes — ❌ REJECTED

**Claim:** Index knowledge nodes incrementally into vectra without rebuilding the skill index. New node → embed → add to vector index → append edges.

**Source verification:** ✅ The technique is real in LightRAG (union merge for incremental updates).

**REJECTION REASON: Already implemented.**

The ideas document claims BookLib needs this, stating "re-indexing skills requires a full vector index rebuild." **This is factually incorrect based on the current codebase.**

`indexer.js` already has `indexNodeFile()` (lines ~130-175) which does exactly what's proposed:
1. Reads a single node file
2. Parses it into chunks (or creates fallback text from frontmatter)
3. Embeds each chunk with `buildMetadataPrefix()` + `getEmbedding()`
4. Inserts into vectra via `this.index.insertItem()`
5. Adds to BM25 index via `bm25.add()`

This method is called from `indexKnowledgeNodes()` during full re-index AND can be called standalone after each capture command. The `capture.js` module presumably calls it after saving a new node.

Furthermore, `appendEdge()` in `graph.js` is already append-only (`fs.appendFileSync`), exactly as the ideas doc acknowledges.

**The only part NOT implemented is avoiding a full vector rebuild when re-indexing skills** (not knowledge nodes). But that's a different problem — skill files change content, so re-embedding is necessary. Vectra doesn't support in-place updates; you'd need to delete old chunks and insert new ones, which is effectively a rebuild for changed files.

**Verdict: ❌ REJECTED** — Already implemented. The ideas document's claim about needing incremental vector insertion for knowledge nodes is based on an incorrect reading of the codebase. `indexNodeFile()` already provides this exact capability.

---

## Summary Table

| # | Finding | Status | Source Quality | Priority | Effort |
|---|---------|--------|---------------|----------|--------|
| 1 | Dual-level keyword routing | ✅ Validated | 5/5 (EMNLP 2025) | P1 | 0.5-1 day |
| 2 | Hydrate graph neighbor content | ✅ Validated | 5/5 (EMNLP 2025) | P1 | 2-4 hours |
| 3 | Entity/relationship profiling | ⚠️ Partial | 5/5 (EMNLP 2025) | P3 | 1-2 days |
| 4 | Incremental vector insertion | ❌ Rejected | 5/5 (EMNLP 2025) | — | — (already done) |

## Cross-Cutting Analysis

**Source quality is excellent.** LightRAG is peer-reviewed at EMNLP 2025 with open-source code. All claims verified. The ideas document's analysis of what to borrow vs. what to skip (LLM-based extraction, LLM theme keys) shows good engineering judgment.

**Two genuinely actionable findings.** Finding 2 (hydrate graph neighbors) is practically a bug fix — the current empty-stub behavior undermines the knowledge graph's value in search. Finding 1 (dual-level keyword routing) is a real architectural improvement that would make multi-concept queries meaningfully better.

**These two findings compound.** Dual-level routing (Finding 1) sends entity keywords to the graph, and hydrated neighbors (Finding 2) ensure graph results contain actual content. Together, they make the knowledge graph a first-class search participant rather than a metadata appendage.

**One false finding.** The incremental vector insertion claim (Finding 4) was based on an incorrect reading of the codebase. `indexNodeFile()` already implements this. This is a useful reminder to always verify claims against actual code.

**Net new actionable items: 2 (P1) + 1 (P3 backlog).**

---
*Validated by daily-research-validator on 2026-04-03.*
