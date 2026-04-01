# BookLib — Value Map & Research Alignment
*April 1, 2026*

---

## What BookLib Is

A local knowledge engine that gives AI agents access to expert knowledge from real books and personal captured insights. It runs locally with zero cloud dependencies, integrates with 13 AI tools via MCP, and produces concise, research-backed context injection.

---

## Value Propositions — Research Validation

### 1. Expert knowledge the model doesn't have

The model knows general programming but not "Item 7 of Effective Java" or "Clean Code Chapter 3: a function should do one thing." BookLib's 24 bundled skills are distilled from specific books — the agent applies them with citations.

**Research alignment:** The ETH Zurich AGENTS.md study (arxiv:2602.11988) validates that context files work — but only when they contain **non-inferable details** the model can't derive on its own. Book-specific principles (item numbers, author-specific frameworks, curated anti-patterns) are exactly this. Generic "write clean code" advice hurts performance; specific "apply the Rule of Three from Refactoring" helps it.

**Current status:** Implemented and validated. 24 skills with XML-tagged structure that separates core principles from examples from anti-patterns — enabling selective injection.

**Gap:** Skills should be audited for conciseness per the ETH Zurich finding. Oversized sections dilute the signal. A `--compact` mode (P1 in backlog) would return only high-signal tags.

---

### 2. Hybrid search

Natural language queries find the most relevant principles across all skills and personal knowledge.

**Research alignment:** The hybrid approach (BM25 + vector + reranking) is grounded in arxiv:2602.12430 which shows 40-60% precision improvement over dense-only baselines. The SRAG metadata prefix approach (arxiv:2603.26670) encodes domain separation directly into the vector space — a 30% QA improvement with p-value 2e-13. Both findings are implemented.

**Current status:** Fully implemented. Five-stage pipeline: query expansion → BM25 + vector search → Reciprocal Rank Fusion → cross-encoder reranking → results. SRAG prefixes active on all indexed chunks.

**Gap:** Embeddings are generated with `all-MiniLM-L6-v2` on Transformers.js v3. Upgrading to v4 (P1) gives ~4x speedup — same model, same results, faster runtime. Late chunking (arxiv:2409.04701, P2) would add another +24% retrieval improvement but requires a model swap and custom pooling.

---

### 3. Personal knowledge graph

Users capture their own insights — architecture decisions, discovered patterns, team conventions — and link them to book skills. These become searchable alongside expert knowledge.

**Research alignment:** The Codified Context paper (arxiv:2602.20478) formalizes exactly this pattern: "hot memory" (always-on skills), "domain agents" (reviewers), and "cold memory" (knowledge base). BookLib's knowledge graph is the cold memory layer. The KG²RAG paper (arxiv:2502.06864, NAACL 2025) shows that organizing search results by graph distance improves coherence — BookLib implements one-hop graph-augmented search.

**Current status:** Implemented. Nodes (markdown + frontmatter), edges (typed JSONL), graph-augmented search with `--graph` flag, `booklib capture` for intentional knowledge creation.

**Gap:** The graph is manually curated (by design — the Spec 3 decision was "no auto-ingestion"). Graph density depends on user engagement. The KG²RAG chunk expansion technique requires denser graphs than BookLib currently has — deferred until capture usage grows.

---

### 4. MCP integration

For 10 out of 13 supported tools, BookLib exposes 8 MCP tools that the agent can call directly. The agent discovers them via MCP protocol, no config file instructions needed for tool discovery.

**Research alignment:** MCP is the industry-standard protocol for agent-tool communication, adopted by Anthropic, OpenAI, Microsoft, Google, and others. BookLib's trigger-oriented tool descriptions ("Use WHEN the user says X" rather than "This tool does Y") align with the OpenDev lazy tool discovery pattern (arxiv:2603.05344) — agents should discover capabilities contextually, not load everything upfront.

**Current status:** Implemented. 8 tools, 10 tool configs, trigger-oriented descriptions. Config files contain a 5-10 line "instinct block" that tells the agent WHEN to use each tool — behavioral triggers, not content dumps.

**Gap:** The `instructions` field in the MCP `initialize` handshake could deliver project context automatically on connect — eliminating the need for config file instinct blocks entirely. Not yet implemented; needs per-client testing to verify support.

---

### 5. Concise config file generation

One `booklib init` generates 30-60 line config files per tool — profile template + skill table + behavioral triggers + reference links. The user owns the file; BookLib adds a small auto-generated section.

**Research alignment:** Directly implements the ETH Zurich finding. Previous BookLib versions generated 3,000-10,000 line config files by dumping raw skill content — exactly the pattern the study shows HURTS agent performance. The new architecture injects metadata only (skill names + descriptions + tags), delegates detail retrieval to MCP search.

**Current status:** Implemented. 5 activity-based profiles (software-development, writing, research, design, general). Config files include official documentation links for each tool so users know how to customize.

**Gap:** None significant. The architecture is research-aligned and tested.

---

### 6. Setup wizard

Interactive guided setup with project detection, skill recommendation, tool configuration, and health diagnostics.

**Research alignment:** Not directly research-driven — this is product UX. However, the recommendation engine uses the same hybrid search pipeline (Section 2), so skill recommendations benefit from the SRAG and retrieval improvements.

**Current status:** Implemented with `@clack/prompts` for modern CLI UX. Detects 13 agents including VS Code extensions. Offers cleanup when users have too many skills installed.

**Gap:** Recommendation quality depends on search index accuracy. With all skills scoring 100% (reranker saturation), differentiation relies on rank-based display scores — functional but not intuitive.

---

### 7. Doctor diagnostic + repair

Detects and fixes problems: too many skills, oversized config files, missing index, stale installs.

**Research alignment:** The ETH Zurich study's finding that oversized context hurts performance directly motivates the "oversized config files" diagnostic. The doctor can detect and cure the exact problem the research identifies.

**Current status:** Implemented. 6 diagnostic checks, `--cure` flag for auto-repair.

**Gap:** The "cure" for oversized config files depends on the new config assembler (Section 5) being the default path — which it now is.

---

### 8. Session management + multi-agent handoff

Agents save progress and hand off to other agents across sessions.

**Research alignment:** The Codified Context paper describes session continuity as essential for multi-agent workflows. BookLib's session system (save, resume, recover, merge, lineage) implements the "persistent memory across agent boundaries" pattern.

**Current status:** Implemented. 14 subcommands covering save/resume, multi-agent merge, lineage tracking, encrypted sessions.

**Gap:** Heavily featured but potentially over-engineered for current usage. No evidence of significant adoption of the advanced coordination features (merge, compare, lineage). May benefit from simplification.

---

## Honest Assessment

### What's strong and research-backed
- **Hybrid search pipeline** — grounded in retrieval research, measurably better than vector-only
- **SRAG metadata prefixes** — validated technique, unique to BookLib in the CLI skill space
- **Concise config generation** — directly implements ETH Zurich findings (less = better)
- **MCP integration** — industry-standard protocol, broad tool coverage
- **Structured skill format** — XML tags enable selective disclosure, validated by research

### What's functional but unvalidated
- **Knowledge graph** — works, but value depends on user engagement. No metrics on actual usage
- **Session management** — comprehensive but possibly over-built. Needs usage data
- **Setup wizard** — works but recommendations could be sharper
- **Doctor** — good diagnostics, limited auto-repair

### What's claimed but not true
- **"Auto-injection via PreToolUse hook"** — not implemented. MCP replaces this for 10/13 tools. Should be removed from website and README.
- **"258+ discoverable skills"** — discovery engine exists but returns empty by default. No external sources configured.

### What's missing (validated by research, not yet built)
- **Compact mode** — ETH Zurich says less context is better. We should support `--compact` output (P1)
- **Transformers.js v4** — free 4x speedup on indexing (P1)
- **Progressive disclosure** — deliver skills in layers, not all at once (P2)
- **MCP Server Cards** — ecosystem discoverability (P2)

---

## Research Sources Referenced

### Peer-reviewed / high-confidence
| Paper | Source Quality | What it validates | Status |
|-------|--------------|-------------------|--------|
| arxiv:2602.11988 — ETH Zurich AGENTS.md study | **4/5** — ETH Zurich SRI Lab, rigorous methodology. Preprint, not yet peer-reviewed, but institution reputation is strong. | Less context = better agent performance | ✅ Implemented (config assembler) |
| arxiv:2502.06864 — KG²RAG (NAACL 2025) | **5/5** — Peer-reviewed at NAACL, top NLP venue | Graph-organized search results | ⚠️ Partially (one-hop only) |
| SIGIR 2025 — SEE Early Exit | **5/5** — Peer-reviewed at SIGIR, top IR venue | Early-exit cross-encoder reranking | ❌ Backlog (GPU requirement) |
| HuggingFace Transformers.js v4 | **5/5** — First-party release announcement | 4x embedding speedup | ❌ P1 backlog |

### Established techniques (no specific paper needed)
| Technique | Status | Notes |
|-----------|--------|-------|
| BM25 + vector hybrid retrieval | ✅ Implemented | Standard IR practice, widely adopted |
| Reciprocal Rank Fusion | ✅ Implemented | Standard IR fusion technique |
| Cross-encoder reranking | ✅ Implemented | Standard re-ranking approach |

### Preprints — use with caveats
| Paper | Source Quality | What it claims | Status | Caveat |
|-------|--------------|----------------|--------|--------|
| arxiv:2603.26670 — SRAG | **3/5** — Recent preprint, not peer-reviewed | Metadata prefixes improve retrieval 30% | ✅ Implemented | Promising but unverified by independent replication |
| arxiv:2602.20478 — Codified Context | **2/5** — Single author, single project, not peer-reviewed | Hot/cold memory + domain agents pattern | Architecturally aligned | Do NOT cite in user-facing materials. Fine for internal reference only |
| arxiv:2603.05344 — OpenDev | **3/5** — System description, not controlled experiment | Progressive/lazy tool discovery | Design pattern adopted | Describes architecture, doesn't prove it outperforms alternatives |
| arxiv:2409.04701 — Late Chunking | **4/5** — Jina AI research team, reproducible | Contextual embeddings +24% | ❌ P2 backlog | Real technique, complex implementation for BookLib's stack |
