# Spec: Multi-Dimensional Graph Search
*Date: 2026-04-02 | Status: Draft — implement after auto-linker and graph density exists*

## Problem

Current search is one-dimensional: query → find matching text → optionally extend with one-hop graph traversal. It finds documents that contain matching words/concepts, but it doesn't understand the SHAPE of what the user is working on.

When a user says "build order CRUD feature," that's three concepts converging: a domain (orders), a pattern (CRUD), and a scope (feature). Each concept connects to different parts of the knowledge graph. The most relevant knowledge lives at the INTERSECTION of these concepts — not in any single search result.

## Solution

A new search mode `graphActivatedSearch(query)` that:
1. Parses the query into semantic concepts
2. Activates graph regions for each concept
3. Finds nodes at the intersection of multiple activations
4. Merges with text search results
5. Returns results ranked by how many concept dimensions they connect to

## How it works

### Step 1: Concept extraction

Split the query into semantic concept terms. Not keywords — concepts.

```
Query: "build order CRUD feature"

Concepts:
  - "order" → domain concept (entity, business area)
  - "CRUD" → pattern concept (create/read/update/delete, controller, API)
  - "feature" → scope concept (new functionality, testing, error handling)
```

For fast mode: simple noun/phrase extraction (already have keyword extraction in query-expander.js).
For local/API mode: the reasoning model identifies concepts.

### Step 2: Graph activation

For each concept, find entry points in the graph:

```
"order":
  → component: order-service (name match)
  → node: "event sourcing decision" (linked to order-service)
  → node: "order data model notes" (title match)
  → skill chunks: domain-driven-design (search match)

"CRUD":
  → skill chunks: springboot-security (controller patterns)
  → skill chunks: clean-code-reviewer (function design)
  → skill chunks: effective-java (API design)
  → node: "REST API conventions" (if captured)

"feature":
  → node: "testing strategy for new features" (if captured)
  → skill chunks: lean-startup (MVP, feature validation)
```

Each concept activates a SUBGRAPH — a set of nodes and their immediate connections.

### Step 3: Intersection scoring

Score every activated node by how many concept dimensions it touches:

```
Node                           | "order" | "CRUD" | "feature" | Score
-------------------------------|---------|--------|-----------|------
"event sourcing decision"      |    ✓    |        |           |  1
"REST API conventions"         |         |   ✓    |           |  1
springboot-security (auth)     |    ✓    |   ✓    |           |  2  ← intersection!
"order controller patterns"    |    ✓    |   ✓    |    ✓      |  3  ← highest relevance
"testing strategy"             |         |        |    ✓      |  1
```

Nodes scoring 2+ concepts are at the intersection — they're the most relevant results. Nodes scoring 1 are supplementary. Nodes scoring 0 are filtered out.

### Step 4: Merge with text search

Run the regular hybrid text search in parallel. Combine:

```
Final score = (graph activation score × weight) + (text search score × weight)
```

Graph activation weight is higher for queries with multiple concepts. Text search weight is higher for single-concept queries. This way:
- "order CRUD feature" → graph activation dominates (multi-concept, graph finds intersections)
- "how to handle nulls" → text search dominates (single concept, graph adds nothing)

### Step 5: Result assembly

Return results ranked by combined score, with attribution showing which concepts matched:

```json
{
  "query": "build order CRUD feature",
  "concepts": ["order", "CRUD", "feature"],
  "results": [
    {
      "principle": "Order controllers should use command/query separation",
      "source": "project note: order controller patterns",
      "matched_concepts": ["order", "CRUD", "feature"],
      "confidence": "high"
    },
    {
      "principle": "Use @PreAuthorize on all mutation endpoints",
      "source": "springboot-security",
      "matched_concepts": ["order", "CRUD"],
      "confidence": "medium"
    },
    {
      "principle": "Event sourcing is intentional for orders — don't change",
      "source": "project decision",
      "matched_concepts": ["order"],
      "confidence": "medium"
    }
  ],
  "note": "3 results across 3 concepts. Top result connects all 3 dimensions."
}
```

## When this activates

Not every query needs graph activation. Simple questions ("what is a factory pattern?") should go through regular search. Multi-concept queries ("build order CRUD feature") benefit from graph activation.

**Heuristic:** if the query has 2+ distinct concept terms, use graph-activated search. If it has 1 concept, use regular search with optional graph extension (current behavior).

## Graceful degradation

| Graph state | Behavior |
|-------------|----------|
| 50+ nodes, rich edges | Full multi-dimensional activation — high value |
| 10-50 nodes | Partial activation — some intersections found, supplemented by text search |
| 1-10 nodes | Minimal activation — mostly text search with occasional graph hits |
| Empty graph | Falls back to regular text search entirely (current behavior) |

The system never fails — it just provides less graph value when the graph is sparse. Text search always runs as the baseline.

## Architecture

```
lib/engine/graph-search.js (new)

exports:
  graphActivatedSearch(query, opts) → results

internally:
  1. extractConcepts(query)        → ['order', 'CRUD', 'feature']
  2. activateSubgraphs(concepts)   → Map<concept, Set<nodeId>>
  3. scoreIntersections(subgraphs) → scored nodes
  4. hybridSearch(query)           → text search results (existing pipeline)
  5. mergeAndRank(graphResults, textResults) → combined results
```

### Concept extraction (fast mode)

For fast mode (no external model), use existing `query-expander.js` keyword extraction plus simple heuristics:
- Nouns and noun phrases from the query
- Filter out stopwords
- Group consecutive related words ("order service" → one concept, not two)

This is imperfect but functional. Local/API modes can use a model for better extraction.

### Subgraph activation

For each concept:
1. Search component names for exact/partial match
2. Search node titles for match
3. Run `lookup` with the concept as query (reuses existing search)
4. Collect all matched node IDs + their 1-hop neighbors

### Intersection scoring

Simple counting: for each unique node ID across all activated subgraphs, count how many concepts activated it. Sort by count (descending), then by text search score within same count.

## Files

- Create: `lib/engine/graph-search.js`
- Create: `tests/engine/graph-search.test.js`
- Modify: `lib/engine/searcher.js` — add `graphActivatedSearch` as alternative to `search`
- Modify: `bin/booklib-mcp.js` — `lookup` tool uses graph search when query has multiple concepts

## Dependencies

- Auto-linker (builds graph density — without it, graph is too sparse for intersections)
- Logit threshold (filters junk from text search component)
- XML principle extraction (structures the final output)

## What this does NOT replace

- Regular text search — still runs as the baseline
- Graph-augmented search (`--graph` flag) — still works for single-hop extension
- The search pipeline (BM25 + vector + SRAG + RRF + reranker) — untouched

This is an additional search MODE, not a replacement. The `lookup` tool decides which mode to use based on query complexity.

## Open questions

- Should concept extraction use the existing query-expander or a separate module?
- How to weight graph activation vs text search? Fixed ratio or adaptive?
- Should the user be able to see which concepts were extracted? (Debugging aid)
- Minimum graph density before activating? (To avoid noise with very sparse graphs)
