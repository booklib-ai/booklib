# BookLib — Validated Feature Ideas Backlog

> Auto-maintained by the daily research validator. Each idea has been reviewed against the actual source material, validated for feasibility, and mapped to a specific implementation path.

## Status Legend
- 🆕 **New** — Just validated, not yet prioritized
- 🔥 **Hot** — High impact + low/medium effort, should be picked up soon
- 📋 **Backlog** — Validated and valuable, but not urgent
- ✅ **Done** — Implemented
- ❌ **Rejected** — Reviewed and decided against (with reason)

---

## Ideas

### [2026-03-31] SRAG: Prepend structured metadata to chunks before embedding
**Status:** ✅ Done | **Source:** [arxiv:2603.26670](https://arxiv.org/abs/2603.26670) (preprint, not peer-reviewed) | **Priority:** P1 | **Spec:** 2
**Summary:** Prefix each chunk with `[skill:{name}] [type:{xml_tag}] [tags:{...}]` before embedding to encode domain separation into the vector space. Claims 30% QA improvement — promising but unverified by independent replication.
**Work estimate:** 1 day | **Files:** `lib/engine/indexer.js`, `lib/engine/parser.js`
**Acceptance criteria:**
- Chunk text prefixed with structured metadata before embedding
- `parseSkillFile()` passes metadata to indexer
- Cross-domain noise in search results is measurably reduced
- No new dependencies required
- Re-index command handles new format cleanly

### [2026-03-31] MCP Server Cards: Add .well-known/mcp/server-card.json
**Status:** 🆕 New | **Source:** [MCP 2026 Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) + [SEP-1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) | **Priority:** P2 | **Spec:** 1
**Summary:** Generate an MCP Server Card alongside the existing .well-known/skills/ endpoint so BookLib's MCP server is discoverable by the entire MCP ecosystem.
**Work estimate:** 0.5 days | **Files:** CI pipeline, `docs/.well-known/`
**Acceptance criteria:**
- `booklib build-wellknown` also generates `server-card.json`
- Card follows the SEP-1649 draft format
- Hosted via GitHub Pages alongside existing skill index

### [2026-03-31] Cite "Codified Context" paper in positioning materials
**Status:** ❌ Rejected | **Source:** [arxiv:2602.20478](https://arxiv.org/abs/2602.20478) (source quality 2/5 — single author, single project, not peer-reviewed) | **Priority:** — | **Spec:** —
**Summary:** ~~Reference the Codified Context paper to position BookLib.~~ **Rejected:** Source quality too low for user-facing citation. Single-author preprint on one project. The taxonomy is useful internally but should not be cited in README or marketing. Kept in internal research notes only.
**Work estimate:** 2 hours | **Files:** `README.md`, `benchmark/RESEARCH.md`
**Acceptance criteria:**
- README references the paper's terminology
- RESEARCH.md maps BookLib's architecture to the paper's taxonomy
- Framing says "aligns with" not "validated by" (single-author preprint)

### [2026-03-31] Late Chunking: Contextual embeddings via long-context model
**Status:** 📋 Backlog | **Source:** [arxiv:2409.04701](https://arxiv.org/abs/2409.04701) | **Priority:** P2 | **Spec:** 2
**Summary:** Switch to jina-embeddings-v2-small-en (8192 tokens) and implement late chunking — embed full skill file first, then chunk. +24% retrieval improvement. Requires custom pooling in transformers.js and full re-index.
**Work estimate:** 3-5 days | **Files:** `lib/engine/indexer.js`, `lib/engine/searcher.js`
**Acceptance criteria:**
- Embedding model swapped to jina-embeddings-v2-small-en
- Token-level embeddings extracted before pooling
- Chunked mean pooling applied per skill section
- Full re-index migration path documented
- Benchmark shows improvement over baseline
**Note:** Implement after hybrid pipeline (Spec 2) is stable. Depends on custom transformers.js pooling — not a drop-in change.

### [2026-04-01] Upgrade to Transformers.js v4 for ~4x embedding speedup
**Status:** 🔥 Hot | **Source:** [HuggingFace Blog](https://huggingface.co/blog/transformersjs-v4) | **Priority:** P1 | **Spec:** 2
**Summary:** Upgrade from @xenova/transformers v3 to @huggingface/transformers v4. ~4x speedup on BERT embeddings via optimized ONNX operators. Same model, same API, dramatically faster indexing. Package renamed, model ID updated, optional WebGPU for GPU users.
**Work estimate:** 0.5–1 day | **Files:** `package.json`, `lib/engine/indexer.js`, `lib/engine/searcher.js`
**Acceptance criteria:**
- Package updated to @huggingface/transformers v4
- Model ID updated to onnx-community/all-MiniLM-L6-v2-ONNX
- Identical index output (same embeddings, same search results)
- Measurable indexing speedup benchmarked
- All existing tests pass

### [2026-04-01] Research-backed skill content guidelines + audit command
**Status:** 🔥 Hot | **Source:** [arxiv:2602.11988](https://arxiv.org/abs/2602.11988) (ETH Zurich SRI Lab) | **Priority:** P1 | **Spec:** Core + Spec 1
**Summary:** ETH Zurich study shows LLM-generated context files reduce agent success rates while increasing cost 20%+. Update skill authoring guidelines to recommend "non-inferable details only." Add `booklib audit` to flag oversized sections. Add `--compact` parser mode for minimal injection.
**Work estimate:** 0.5–1 day | **Files:** docs, `lib/engine/parser.js`, `bin/cli.js`
**Acceptance criteria:**
- Authoring docs cite study and recommend concise, non-inferable content
- `booklib audit` reports per-section token counts with threshold warnings
- `parser.js` supports --compact mode (core_principles + anti_patterns only)
- README positions BookLib's format as research-backed
**Note:** Reinforced by OpenDev paper (arxiv:2603.05344) which demonstrates progressive disclosure pattern. BookLib's XML tags are natural disclosure layers.

### [2026-04-01] Progressive skill disclosure via --progressive flag
**Status:** 📋 Backlog | **Source:** [arxiv:2603.05344](https://arxiv.org/abs/2603.05344) (OpenDev) + [arxiv:2602.11988](https://arxiv.org/abs/2602.11988) (ETH Zurich) | **Priority:** P2 | **Spec:** 1
**Summary:** Add `booklib context --progressive` that outputs skills in layers (metadata → core_principles → full). Inspired by OpenDev's lazy tool discovery pattern, validated by ETH Zurich's finding that less context performs better. Uses BookLib's existing XML-tagged structure.
**Work estimate:** 1 day | **Files:** `lib/engine/parser.js`, `bin/cli.js`
**Acceptance criteria:**
- `--progressive` flag outputs three disclosure levels
- Hook injection can use compact mode for first injection, expand on demand
- No breaking changes to existing parsing
**Note:** Implement through existing BookLib mechanisms (--compact flag, parser modes) rather than non-standard MCP protocol extensions. MCP contract changes carry adoption risk.

### [2026-04-01] SEE: Early-exit cross-encoder reranking
**Status:** 📋 Backlog | **Source:** [SIGIR 2025](https://dl.acm.org/doi/10.1145/3726302.3729962) | **Priority:** P3 | **Spec:** 2
**Summary:** Cross-encoder reranking with similarity-based early exit — terminate forward pass when intermediate layers already provide confident ranking. Peer-reviewed at SIGIR. But: PyTorch/GPU only, no ONNX path, and BookLib has no cross-encoder yet. Long-term backlog item.
**Work estimate:** 2-3 weeks (including prerequisite cross-encoder work) | **Files:** `lib/engine/reranker.js` (new), `lib/engine/searcher.js`
**Note:** Blocked on Spec 2 cross-encoder implementation. Current impl is PyTorch+GPU only — would need custom ONNX layer-by-layer export for transformers.js. Defer until hybrid pipeline is stable.

### [2026-04-07] Qwen3-Embedding-0.6B as high-quality embedding model option
**Status:** 🆕 New | **Source:** [arxiv:2506.05176](https://arxiv.org/abs/2506.05176) (Alibaba, June 2025) + [ONNX model](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX) | **Priority:** P2 | **Spec:** 2
**Summary:** Integrate Qwen3-Embedding-0.6B-ONNX as an optional embedding provider alongside all-MiniLM-L6-v2. Confirmed compatible with @huggingface/transformers via ONNX. Significantly outperforms all-MiniLM-L6-v2 on code retrieval benchmarks. 0.6B params (~1.2GB) is larger — opt-in via `booklib config set model qwen3-0.6b` with lazy download.
**Work estimate:** 1-2 days | **Files:** `lib/engine/embedding-provider.js`, `lib/engine/indexer.js`, `lib/engine/searcher.js`, `bin/cli.js`
**Acceptance criteria:**
- `embedding-provider.js` supports model selection (miniLM default, qwen3 optional)
- `booklib config set model qwen3-0.6b` switches embedding model
- First use triggers lazy download with progress bar
- Re-index required after model switch (with clear user prompt)
- Benchmark: retrieval quality improvement over all-MiniLM-L6-v2
- Benchmark: cold-start time and per-query latency on CPU
**Note:** Depends on Transformers.js v4 upgrade. The paired Qwen3-Reranker-0.6B does NOT yet have ONNX/Transformers.js support — monitor only.

### [2026-04-07] Align skill format with agentskills.io spec + register on marketplaces
**Status:** 🔥 Hot | **Source:** [agentskills.io/specification](https://agentskills.io/specification) + [Anthropic spec](https://github.com/anthropics/skills/blob/main/spec/agent-skills-spec.md) | **Priority:** P2 | **Spec:** 1
**Summary:** Audit SKILL.md format against the agentskills.io specification. Generate `.well-known/agent-skills.json` endpoint. Submit curated skills to SkillsMP and skills.sh marketplaces for discoverability. The Agent Skills spec is now supported by VS Code (Copilot), Claude Code, Cursor, Codex/ChatGPT — format compliance is table stakes.
**Work estimate:** 0.5-1 day | **Files:** `bin/cli.js` (build-wellknown), skill metadata, docs
**Acceptance criteria:**
- All 22 bundled skills audited against agentskills.io field requirements
- Format divergences fixed (if any)
- `booklib build-wellknown` generates `agent-skills.json` alongside `server-card.json`
- Skills submitted to SkillsMP and skills.sh
- README mentions Agent Skills specification compatibility
**Note:** Complementary to MCP Server Cards idea (2026-03-31). Both `.well-known` files should be generated together.

### [2026-04-07] GraphAnchor iterative graph indexing pattern for Spec 3
**Status:** 📋 Backlog | **Source:** [arxiv:2601.16462](https://arxiv.org/abs/2601.16462) (NEUIR, Jan 2026) | **Priority:** P3 | **Spec:** 3
**Summary:** Reference GraphAnchor's principle of incremental graph expansion for Spec 3's knowledge graph design. Graphs as evolving indices rather than static representations — aligns with BookLib's append-only JSONL edge storage. Apply to `booklib capture` (expand graph incrementally on new content) but NOT to runtime search (keep <500ms target).
**Work estimate:** Design reference only until Spec 3 begins | **Files:** `lib/engine/graph.js`, `lib/engine/capture.js`
**Acceptance criteria:**
- Spec 3 design doc references GraphAnchor's incremental indexing approach
- `booklib capture` expands graph incrementally (entity extraction on new content only)
- Graph edges are append-only, not reconstructed on each capture
**Note:** The paper's runtime iterative expansion is NOT applicable to BookLib (requires LLM-in-the-loop, breaks <500ms target). Only the offline indexing pattern is relevant.

### [2026-04-07] RACG survey — eval harness design reference
**Status:** 📋 Backlog | **Source:** [arxiv:2510.04905](https://arxiv.org/abs/2510.04905) (v2 Jan 2026) | **Priority:** P3 | **Spec:** 2
**Summary:** Mine the RACG survey's evaluation protocols and retrieval modality comparisons to inform Spec 2's benchmark eval harness design. Extract which chunk formats and context structures work best for repo-level code generation. Design input only — no code changes.
**Work estimate:** 2-4 hours reading | **Files:** `benchmark/` design docs
**Acceptance criteria:**
- Spec 2 eval harness references survey methodology
- Chunk format decisions informed by survey findings
