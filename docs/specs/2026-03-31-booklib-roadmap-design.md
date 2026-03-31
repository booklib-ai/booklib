# BookLib Roadmap Design — Parallel Phased Specs
*Date: 2026-03-31 | Status: Approved*

## Context

Research across agentskills.io, skills.sh, anthropics/skills, microsoft/skills, QMD, txtai, and arxiv
2602.12430 revealed two independent growth vectors for BookLib:

1. **Distribution gap** — 91K skills indexed on skills.sh, 30+ agents on agentskills.io. BookLib supports 8
   agents and has no presence on the open marketplace.
2. **Retrieval gap** — BookLib's current pure vector search (`vectra` + `all-MiniLM-L6-v2`) is functional but
   uncompetitive against hybrid pipelines (BM25 + vector + reranking) that show 40–60% precision improvements
   in the literature.

A third vector — the knowledge graph — can turn captured expertise into a citable research artifact once the
retrieval foundation is solid.

The three specs are independent by design: they touch different files, ship in sequence, and each one has
value on its own.

---

## Spec 1 — Ecosystem Alignment

### Goal

Make BookLib discoverable and installable from the full agentskills.io / skills.sh ecosystem with verified
compatibility across 30+ agents.

### 1.1 agentskills.io Spec Compliance

Audit every bundled `SKILL.md` against the current [agentskills.io specification](https://agentskills.io/specification).
Add missing optional fields that the marketplace and compatible agents use for filtering:

```yaml
---
name: effective-kotlin
description: ...           # already present
version: "1.0"             # enables skills.sh versioning
tags: [kotlin, jvm, oop]   # enables category filtering
license: MIT               # required by some agents
---
```

Scope: all 22 bundled `skills/*/SKILL.md` files. No logic changes — metadata only.

### 1.2 skills.sh / `npx skillsadd` Publishing

[skills.sh](https://skills.sh/) indexes skills at `owner/repo/skill-id`. The install command
`npx skillsadd booklib-ai/skills/effective-kotlin` already matches the repo layout
(`skills/effective-kotlin/SKILL.md`). Deliverable: submit `booklib-ai/skills` to the skills.sh directory
so all 22 skills appear on the leaderboard individually.

### 1.3 `/.well-known/skills/` Auto-Discovery Endpoint

`npx skills add https://booklib-ai.github.io/skills/` works by fetching
`/.well-known/skills/default/skill.md`. A new `booklib build-wellknown` command (run in CI on every
release) generates this index file and writes it to:

```
docs/
└── .well-known/
    └── skills/
        └── default/
            └── skill.md   # auto-generated index of all 22 skills
```

Hosted via GitHub Pages at `booklib-ai.github.io/skills`.

### 1.4 Extended Agent Compatibility (8 → 30+)

`lib/installer.js` gains writers for agents on the agentskills.io carousel not yet supported:

| Agent | Config location | What to write |
|-------|----------------|---------------|
| Gemini CLI | `GEMINI.md` | BookLib context block |
| Roo Code | `.roo/rules/*.md` | One file per skill profile |
| OpenHands | `.openhands/instructions.md` | Init block |
| JetBrains Junie | `.junie/guidelines.md` | Principles block |
| Goose | `.goose/config.yaml` | Skills section |
| OpenCode | `opencode.toml` | Skills array |
| Letta | skill dir per spec | Forwarded to skills dir |

`booklib init` gains **auto-detection**: checks which tools exist in `$PATH` or local config and only
writes for detected agents. Manual `--target=cursor` still works but is no longer necessary for most
cases. If nothing is detected, falls back to Claude Code only (current default) and prints a list of
undetected agents the user can add manually.

### 1.5 Files Changed

- `lib/installer.js` — new agent writers + auto-detection
- All 22 `skills/*/SKILL.md` — frontmatter additions
- CI release pipeline — `booklib build-wellknown` step
- `docs/.well-known/skills/default/skill.md` — generated artifact

Does **not** touch: search pipeline, knowledge graph, MCP server.

---

## Spec 2 — Retrieval Quality

### Goal

Upgrade from pure vector search to a full hybrid retrieval pipeline — grounded in the QMD architecture
and arxiv 2602.12430 — with a benchmark eval harness that makes the improvement falsifiable.

### Current Baseline

`lib/engine/searcher.js`: embed query → cosine similarity against vectra index → filter by `minScore`.
No keyword recall, no reranking, no query expansion.

### 2.1 Pipeline Architecture

Four sequential stages, each a separate module:

```
Query
  │
  ▼
[query-expander.js]   → 3 sub-queries: lexical / semantic / hypothetical
  │
  ├──▶ [bm25-index.js]   → keyword recall on stored chunks
  ├──▶ [vectra index]    → semantic recall (existing, unchanged)
  │
  ▼
[rrf.js]              → Reciprocal Rank Fusion
  │                      original query weight 2×, expanded queries 1×
  ▼
[reranker.js]         → cross-encoder rescores top-20, returns top-5
  │
  ▼
  Results (same interface: score, text, metadata)
```

Callers of `BookLibSearcher.search()` see no API change.

### 2.2 New Modules

**`lib/engine/query-expander.js`**
Generates sub-queries: (1) extracted keywords, (2) paraphrase, (3) hypothetical document
("a passage explaining X would say…"). Falls back to keyword extraction only if no LLM is available.
Original query always gets 2× weight in RRF to prevent expansion from dominating exact matches.

**`lib/engine/bm25-index.js`**
BM25 over the same text chunks already in vectra. Built alongside the vector index during `booklib index`.
Stored as a lightweight JSON file (term frequencies + IDF weights) in the same index directory.
No new database dependency.

**`lib/engine/rrf.js`**
Reciprocal Rank Fusion: `score(d) = Σ 1/(k + rank(d))` across all result lists. Stateless utility
function. `k=60` per standard RRF literature.

**`lib/engine/reranker.js`**
Cross-encoder model (`Xenova/ms-marco-MiniLM-L-6-v2`, ~22 MB) scores `(query, passage)` pairs
directly. Applied only to the top-20 RRF candidates to keep latency under 500ms. Lazy-loaded via the
same pattern as the existing embedding model.

### 2.3 Indexer Changes

`lib/engine/indexer.js` builds two indices in one pass:
- Existing: vectra vector index (unchanged)
- New: `bm25.json` written to the same index directory

`booklib index` rebuilds both. No new CLI flags.

### 2.4 Benchmark Eval Harness

```
benchmark/
├── ground-truth.json    # 100+ curated query → relevant_skill pairs
├── run-eval.js          # computes MRR@5, NDCG@5, Recall@5
└── RESEARCH.md          # maps results to arxiv 2602.12430 claims
```

`booklib benchmark` command runs the eval and prints a comparison table: baseline (pure vector) vs
hybrid pipeline vs hybrid + reranking.

Expected outcome based on QMD's published numbers: 40–60% precision improvement, 90%+ token reduction
from returning fewer but more relevant chunks.

### 2.5 Files Changed

- `lib/engine/searcher.js` — reworked to hybrid pipeline
- `lib/engine/indexer.js` — co-builds BM25 index
- `lib/engine/query-expander.js` — new
- `lib/engine/bm25-index.js` — new
- `lib/engine/rrf.js` — new
- `lib/engine/reranker.js` — new
- `benchmark/` — new directory

Does **not** touch: installer, SKILL.md files, graph, MCP. Search API surface identical.

---

## Spec 3 — Knowledge Graph + Research

### Goal

Turn the existing knowledge graph into a queryable augmentation layer for search results, establish a
manual knowledge capture workflow, and produce a citable research artifact connecting the implementation
to arxiv 2602.12430.

### Key Decisions (rationale)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Graph retrieval activation | Opt-in (`--graph` flag) | Avoids noise from low-quality edges in v1 |
| Graph population source | Manual `booklib capture` only | Auto-ingestion from sessions produces uncurated nodes |
| Research artifact form | `benchmark/RESEARCH.md` | Extends Spec 2 benchmark; no separate submission needed |
| Graph scope | Skills-only nodes | Project file nodes deferred to Spec 4 |

### 3.1 Graph-Augmented Retrieval

`booklib search "X" --graph` appends graph-linked skills to Spec 2 results:

1. Run hybrid search (Spec 2 pipeline) → top-5 results
2. For each result, look up outbound edges in `graph.jsonl`
3. Follow `see-also`, `applies-to`, `extends` edges one hop
4. Append linked skills (deduplicated, marked `source: graph`) to output

The `--graph` flag defaults to off. Becomes the default once edge quality is validated.

### 3.2 Manual Knowledge Capture

`booklib capture` command creates a new graph node interactively:

```
booklib capture --title "Null Object Pattern" \
                --type insight \
                --tags kotlin,patterns \
                --links "effective-kotlin:applies-to,design-patterns:see-also"
```

Node written as a `gray-matter` markdown file to `~/.booklib/knowledge/nodes/`. Edge written to
`graph.jsonl`. No auto-ingestion from sessions or files — capture is always intentional.

### 3.3 Research Artifact

`benchmark/RESEARCH.md` is a manually authored document (not auto-generated). The maintainer writes it
using `booklib benchmark` output as input data, mapping measured retrieval numbers to specific claims in
arxiv 2602.12430:

- Which architectural claims the BookLib benchmark confirms
- Which claims require different conditions to hold
- Retrieval quality table: baseline → Spec 2 hybrid → Spec 2 + graph augmentation

This is the document that makes BookLib citable in follow-on work without requiring a separate arxiv
submission.

### 3.4 Files Changed

- `lib/engine/searcher.js` — `--graph` flag reads `graph.jsonl` and appends linked results
- `lib/engine/graph.js` — read path for edge traversal (write path already exists)
- `booklib capture` command — new (minimal: title, type, tags, links)
- `benchmark/RESEARCH.md` — new (written after benchmarks run)

Does **not** touch: installer, SKILL.md files, search pipeline internals, MCP.

---

## Roadmap Summary

| Spec | Primary files | Ships independently? | Value if others never ship |
|------|--------------|---------------------|---------------------------|
| **1 — Ecosystem** | `lib/installer.js`, 22 SKILL.md, CI pipeline | Yes | BookLib in 30+ agents, skills.sh marketplace |
| **2 — Retrieval** | `lib/engine/searcher.js` + 4 new modules, `benchmark/` | Yes | Measurably better search, publishable benchmark |
| **3 — Graph+Research** | `lib/engine/graph.js`, `booklib capture`, `RESEARCH.md` | Partial — `booklib capture` and `RESEARCH.md` ship standalone; `--graph` augmentation requires Spec 2 merged first | Citable research artifact, capture workflow |

Suggested sequence: 1 → 2 → 3. Each spec unlocks value immediately without waiting for the next.

---

## Out of Scope (explicit)

- Project file nodes in the knowledge graph (Spec 4 candidate)
- Auto-ingestion of sessions into the graph
- Separate arxiv submission
- REST/HTTP search API (MCP already covers programmatic access)
- `skills.sh` leaderboard gaming / bulk skill inflation
