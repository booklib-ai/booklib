# LightRAG — Borrowable Ideas for BookLib

> **Source:** [LightRAG: Simple and Fast Retrieval-Augmented Generation](https://arxiv.org/abs/2410.05779) (Guo et al., 2024)
> **Date reviewed:** 2026-04-03

## Context

LightRAG is a graph + vector hybrid RAG framework. It's a general-purpose retrieval backend, not a competitor to BookLib (different product category), but several implementation techniques are worth borrowing for `lib/engine/`.

---

## 1. Dual-level keyword extraction

LightRAG splits every query into **local keywords** (entity-specific: "JWT", "order-service") and **global keywords** (thematic: "authentication patterns", "event-driven architecture"). Each type hits a different part of the graph.

**BookLib today:** `expandQuery()` does synonym expansion but doesn't distinguish entity-level vs theme-level terms.

**What to borrow:** In `query-expander.js`, classify expanded terms into entity keywords (match against node names/tags) and concept keywords (match against skill names/sections). Route entity keywords to the knowledge graph first, concept keywords to BM25+vector. This would make `brief` much better — "build order CRUD" would route "order" to graph nodes and "CRUD" to skill content.

**Impact:** High. Directly improves multi-concept queries and the `brief` tool.

---

## 2. One-hop neighbor hydration

After matching entities, LightRAG pulls in all one-hop neighbors with their full content to add structural context.

**BookLib today:** `_appendGraphResults()` does BFS traversal via `traverseEdges(nodeId, edges, 1)`, but appends graph results as empty metadata stubs (`text: '', score: 0`). They're pointers, not content.

**What to borrow:** When pulling one-hop neighbors, actually load node content (`loadNode()`) and include it as context. A neighbor linked via `applies-to` is probably relevant enough to inject its body, not just its ID.

**Impact:** High. Low effort, immediate quality improvement.

---

## 3. Entity/relationship profiling (K,V summaries)

LightRAG generates a **summary paragraph** for each entity and relationship that aggregates all mentions across chunks. The key is the entity name; the value is a synthesized description.

**BookLib today:** Knowledge nodes have frontmatter + body, but no automatic summary that aggregates all places a concept appears across skills.

**What to borrow:** During indexing, build a lightweight entity profile for frequently-referenced concepts (e.g., "event sourcing" appears in 3 skills and 2 user notes). Store as a synthetic node or index metadata. When queried, the profile surfaces first as a hub.

**Impact:** Medium. More useful as the knowledge graph grows.

---

## 4. Incremental graph updates (union merge)

LightRAG processes new documents independently, then merges via set union of nodes and edges — no full rebuild.

**BookLib today:** `appendEdge()` is already append-only. But re-indexing skills requires a full vector index rebuild.

**What to borrow:** For knowledge nodes (user-captured insights), index incrementally into vectra without rebuilding the skill index. New node → embed → add to vector index → append edges. Already close to this, just needs the vector insertion path.

**Impact:** Medium. Matters more at scale.

---

## 5. What's NOT worth borrowing

- **LLM-based entity extraction** — LightRAG uses LLM calls to extract entities from text. BookLib's corpus is small and structured, so manual capture + auto-linker is the right approach.
- **Global theme keys via LLM** — They use an LLM to generate thematic labels for relationships. BookLib's tag system + skill names already serve this purpose.

---

## Priority

1. **Dual-level keyword routing** (#1) — biggest search quality improvement
2. **Hydrate graph neighbors** (#2) — low effort, immediate win
3. **Incremental vector insertion** (#4) — when user knowledge graph grows
4. **Entity profiles** (#3) — longer term
