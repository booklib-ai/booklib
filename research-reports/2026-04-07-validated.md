# BookLib Validated Research Report — 2026-04-07

**Validator run:** 2026-04-07 | **Source report:** 2026-04-07-research.md
**Findings reviewed:** 8 | **Duplicates:** 3 | **Validated:** 2 | **Partially validated:** 2 | **Rejected:** 1

---

## Finding 1: Transformers.js v4 — 4x BERT Embedding Speedup

**Verdict:** 🔁 DUPLICATE — already covered on [2026-04-01]

Already tracked in IDEAS.md as "[2026-04-01] Upgrade to Transformers.js v4 for ~4x embedding speedup" with 🔥 Hot status. No new information in today's report beyond what was validated on 04-01. Skip full validation.

---

## Finding 2: Efficient Cross-Encoder Reranking via Early Exit (SIGIR 2025)

**Verdict:** 🔁 DUPLICATE — already covered on [2026-04-01]

Already tracked in IDEAS.md as "[2026-04-01] SEE: Early-exit cross-encoder reranking" with 📋 Backlog status. The 04-05 validated report also noted BGE-reranker-v2-m3 ONNX as the concrete unblocking model. No new developments since then. Skip full validation.

---

## Finding 3: GraphAnchor — Iterative Graph Construction for RAG

**Verdict:** ⚠️ PARTIALLY VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2601.16462](https://arxiv.org/abs/2601.16462)
- **Source type:** Preprint (not peer-reviewed)
- **Authors:** Zhenghao Liu, Mingyan Wu, Xinze Li, Yukun Yan, Shuo Wang, Cheng Yang, Minghe Yu, Zheni Zeng, Maosong Sun — 9 authors from NEUIR group (Tsinghua-adjacent)
- **Open code:** ✅ [github.com/NEUIR/GraphAnchor](https://github.com/NEUIR/GraphAnchor)
- **Date:** January 23, 2026
- **Credibility:** 3.5/5 — reputable research group, open code, multi-author. But preprint, not peer-reviewed.

### Claim Verification
- **Iterative graph expansion during retrieval:** ✅ Confirmed — the paper incrementally updates a graph to anchor salient entities and guide subquery formulation
- **Tested on 4 multi-hop QA benchmarks:** ✅ Confirmed
- **"Graphs don't need to be built upfront":** ✅ Confirmed — this is the core insight

### Technical Feasibility for BookLib
- **Node.js + transformers.js:** ⚠️ The paper's implementation is Python + LLM-dependent. Entity extraction and relation linking require an LLM in the loop. Not a simple port.
- **Latency:** ❌ Iterative graph expansion with LLM calls per retrieval step is incompatible with BookLib's <500ms search target. This is a multi-turn, multi-LLM-call process.
- **CPU-only:** ⚠️ The LLM dependency is the bottleneck, not GPU vs CPU.
- **Alignment with Spec 3:** ✅ Conceptually validates BookLib's planned graph architecture (append-only JSONL edges, nodes-as-md-files). But BookLib's graph is for offline indexing, not runtime iterative expansion.

### Why Partially Validated
The paper is real and the architectural insight is sound: graphs as evolving indices rather than static representations. This validates Spec 3's direction. However, the runtime iterative expansion pattern is not directly applicable to BookLib's CLI use case — BookLib needs fast retrieval (<500ms), not multi-hop QA with LLM-in-the-loop graph expansion. The value is conceptual/directional, not immediately implementable.

### Competitive Value
- **Genuine differentiator?** No — the technique applies to multi-hop QA, not skill retrieval
- **Validates Spec 3 direction?** Yes — incremental graph construction is confirmed as a sound approach
- **Priority:** Low — Spec 3 is not active; this is future reference material

### Deduplication Check
No overlap with existing IDEAS.md entries. The graph work is new territory.

### Feature Proposal (narrow scope — design reference only)

**Title:** Reference GraphAnchor's iterative indexing pattern for Spec 3 graph design
**Description:** When implementing Spec 3's knowledge graph, adopt GraphAnchor's principle of incremental graph expansion during `booklib capture` rather than requiring full upfront graph construction. The append-only JSONL edge format already supports this pattern.
**Acceptance criteria:**
- Spec 3 design doc references GraphAnchor's incremental indexing approach
- `booklib capture` expands the graph incrementally (entity extraction on new content only)
- Graph edges are append-only, not reconstructed on each capture
- No runtime graph expansion during search (keep <500ms target)
**Files to modify:** `lib/engine/graph.js`, `lib/engine/capture.js`, Spec 3 design doc
**Dependencies:** Spec 3 work must begin first
**Priority:** P3 — design reference, not urgent

---

## Finding 4: BGE-M3 ONNX — Unified Dense + Sparse + ColBERT Vectors

**Verdict:** ❌ REJECTED

### Source Verification
- **Repository exists:** ✅ [yuniko-software/bge-m3-onnx](https://github.com/yuniko-software/bge-m3-onnx) confirmed
- **ONNX models on HuggingFace:** ✅ Confirmed at [yuniko-software/bge-m3-onnx](https://huggingface.co/yuniko-software/bge-m3-onnx)
- **Source type:** Open-source implementation (not a research paper)
- **Credibility:** 3/5 — working implementation but community-maintained ONNX conversion

### Why Rejected

The research report makes a critical claim: "Transformers.js v4 supports BGE-M3 architecture" and implies a single model could replace BM25 + vector search. This claim does not survive scrutiny:

1. **No Node.js support.** The yuniko-software implementation provides C#, Java, and Python wrappers. There is NO Node.js implementation. Web search confirms this gap.

2. **Transformers.js does NOT support multi-vector output.** While Transformers.js v4 supports the base XLM-RoBERTa architecture that BGE-M3 is built on, it supports standard feature extraction (dense embeddings only). The sparse and ColBERT vector heads require custom model architecture support that Transformers.js does not provide. The "unified dense + sparse + ColBERT from one model" claim requires the custom output heads, not just the base architecture.

3. **Model size is prohibitive.** BGE-M3 is 568M parameters (~2.2GB). For a CLI tool targeting <500ms cold start, this is a non-starter without significant optimization (quantization, lazy loading). Compare: all-MiniLM-L6-v2 is 22M params (~90MB).

4. **The value proposition collapses without sparse vectors.** If you can only get dense embeddings from BGE-M3 via Transformers.js, you still need a separate BM25 index — which eliminates the entire motivation for switching. You'd have a much larger, slower model producing the same output type as the current all-MiniLM-L6-v2.

5. **Better alternatives exist.** Qwen3-Embedding-0.6B (Finding 5) is actually available as ONNX with confirmed Transformers.js compatibility and better code retrieval benchmarks.

**Bottom line:** The report oversells BGE-M3's readiness for BookLib's Node.js stack. The unified multi-vector promise is real in Python but not achievable in Transformers.js today.

---

## Finding 5: Qwen3-Embedding-0.6B — Top Code Embedding Model

**Verdict:** ✅ VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2506.05176](https://arxiv.org/abs/2506.05176) (v3, June 11, 2025)
- **Source type:** Technical report + official model release from Qwen team (Alibaba)
- **Authors:** Multi-author from Alibaba research (confirmed)
- **Open models:** ✅ Apache 2.0, available on HuggingFace in 0.6B / 4B / 8B sizes
- **ONNX version:** ✅ Confirmed at [onnx-community/Qwen3-Embedding-0.6B-ONNX](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX)
- **Transformers.js compatibility:** ✅ CONFIRMED — Transformers.js 3.6.0 release notes include Qwen3 support. Working code examples exist using `@huggingface/transformers` feature-extraction pipeline.
- **MTEB benchmarks:** ✅ Qwen3-Embedding-8B scored #1 on MTEB multilingual leaderboard (June 2025). 0.6B variant significantly outperforms all-MiniLM-L6-v2.
- **Credibility:** 5/5 — major research lab, peer-benchmarked, open-source, confirmed compatible

### Claim Verification
- **"Highest for any open model on code retrieval":** ✅ For the 8B variant. The 0.6B variant is strong but not the absolute best — it trails behind Gemini-Embedding but outperforms all-MiniLM-L6-v2 by a significant margin.
- **Paired reranker models:** ✅ Qwen3-Reranker-0.6B/4B/8B exist. However, as noted in 04-05 validated report, Qwen3-Reranker does NOT yet have ONNX export or confirmed Transformers.js compatibility. Monitor only.
- **119 languages supported:** ✅ Confirmed

### Technical Feasibility for BookLib
- **Node.js + @huggingface/transformers:** ✅ Drop-in compatible via ONNX model
- **Latency:** ⚠️ 0.6B params is ~27x larger than all-MiniLM-L6-v2 (22M). First-load and inference will be slower. Need benchmarking to determine if <500ms search is achievable.
- **CPU-only:** ✅ ONNX Runtime supports CPU inference
- **Memory:** ⚠️ ~1.2GB model file vs ~90MB for all-MiniLM-L6-v2. Significant difference for CLI tool. Could be mitigated with quantized (q4) variant if available.
- **API contract:** ✅ No breaking changes — embedding provider swap is internal to `lib/engine/embedding-provider.js`
- **Cold start:** ⚠️ The main concern. Model download on first use (~1.2GB) and load time need profiling.

### Competitive Value
- **Genuine differentiator?** YES — significantly better code retrieval quality positions BookLib as the highest-quality skill retrieval tool
- **User-noticeable?** YES — better embeddings = more relevant search results = better skill recommendations
- **Unique positioning?** Strengthens "curated + high-quality retrieval" narrative

### Deduplication Check
- **04-05 report mentioned Qwen3-Reranker-0.6B-seq-cls** as a monitoring item for reranking. This is the EMBEDDING model — different purpose. NOT A DUPLICATE.
- **Late Chunking idea (IDEAS.md)** referenced jina-embeddings-v2. Qwen3 is an alternative path. RELATED but not duplicate.

### Feature Proposal

**Title:** Add Qwen3-Embedding-0.6B as high-quality embedding model option
**Description:** Integrate Qwen3-Embedding-0.6B-ONNX as an alternative embedding provider alongside the current all-MiniLM-L6-v2. Users can opt in via `booklib config set model qwen3-0.6b` for higher-quality code retrieval at the cost of larger model size. Default remains all-MiniLM-L6-v2 for fast cold-start.
**Acceptance criteria:**
- `lib/engine/embedding-provider.js` supports model selection (miniLM default, qwen3 optional)
- `booklib config set model qwen3-0.6b` switches embedding model
- First use triggers lazy model download with progress bar
- Re-index required after model switch (with clear user prompt)
- Benchmark: Qwen3-0.6B vs all-MiniLM-L6-v2 on BookLib's eval corpus for retrieval quality
- Benchmark: cold-start time and per-query latency on CPU
**Files to modify:** `lib/engine/embedding-provider.js`, `lib/engine/indexer.js`, `lib/engine/searcher.js`, `bin/cli.js`
**Dependencies:** Transformers.js v4 upgrade (already in IDEAS.md as 🔥 Hot)
**Priority:** P2 — high value but depends on Transformers.js v4 upgrade first

---

## Finding 6: Retrieval-Augmented Code Generation Survey (Repository-Level)

**Verdict:** ✅ VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2510.04905](https://arxiv.org/abs/2510.04905) (v2, January 25, 2026)
- **Source type:** Survey paper (preprint)
- **Authors:** Yicheng Tao, Yao Qin, Yepang Liu — 3 authors
- **Credibility:** 3.5/5 — comprehensive survey, cited on SemanticScholar and ResearchGate, updated January 2026. Not peer-reviewed but systematic methodology.

### Claim Verification
- **Categorizes RACG landscape:** ✅ Confirmed — covers generation strategies, retrieval modalities, model architectures, training paradigms, evaluation protocols
- **Focus on repository-level approaches:** ✅ Confirmed
- **Updated January 2026:** ✅ Confirmed (v2)

### Technical Feasibility for BookLib
This is a design input, not a code change. Zero implementation risk.

### Competitive Value
- **Genuine differentiator?** No — this is background reading, not a feature
- **Design value?** MEDIUM — evaluation protocols and retrieval modality comparisons directly inform Spec 2's eval harness and hybrid pipeline design

### Deduplication Check
No overlap with existing IDEAS.md entries. Previous reports haven't covered RACG survey literature.

### Feature Proposal (narrow scope — design input)

**Title:** Mine RACG survey for eval harness design patterns
**Description:** Review the survey's evaluation protocols and retrieval modality comparisons to inform BookLib's Spec 2 benchmark eval harness design. Extract which chunk formats and context structures perform best for code generation tasks to optimize skill chunk boundaries.
**Acceptance criteria:**
- Spec 2 eval harness design doc references RACG survey's evaluation methodology
- Chunk format decisions in `lib/engine/parser.js` are informed by survey findings
- No code changes — pure design/documentation input
**Files to modify:** `benchmark/` design docs, Spec 2 design doc
**Dependencies:** None
**Priority:** P3 — useful reference material, not blocking

---

## Finding 7: MCP 2026 Roadmap — Transport Scalability & Registry Discovery

**Verdict:** 🔁 DUPLICATE — already covered on [2026-03-31]

Already tracked in IDEAS.md as "[2026-03-31] MCP Server Cards: Add .well-known/mcp/server-card.json" with 🆕 New status. The MCP 2026 roadmap was the original source for that idea. Today's report adds no new actionable items beyond confirming that MCP Server Cards and registry discovery remain on the roadmap (they do — confirmed via web search). The Linux Foundation governance detail is informational only.

**Update to existing idea:** The 2026 roadmap's "Streamable HTTP" priority confirms that BookLib's MCP server should monitor for SDK updates but no action needed now. Add a note to the existing IDEAS.md entry.

---

## Finding 8: Agent Skills Ecosystem Explosion — Competitive Landscape Update

**Verdict:** ⚠️ PARTIALLY VALIDATED

### Source Verification
- **agentskills.io specification:** ✅ Confirmed — [agentskills.io/specification](https://agentskills.io/specification)
- **Anthropic skills spec:** ✅ Confirmed — [github.com/anthropics/skills](https://github.com/anthropics/skills/blob/main/spec/agent-skills-spec.md) (December 2025)
- **OpenAI adoption:** ✅ Confirmed — [developers.openai.com/codex/skills](https://developers.openai.com/codex/skills)
- **VS Code Copilot support:** ✅ Confirmed — [code.visualstudio.com/docs/copilot/customization/agent-skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- **Vercel skills.sh:** ✅ Confirmed via InfoQ announcement
- **SkillsMP:** ✅ Confirmed at [skillsmp.com](https://skillsmp.com/)
- **Credibility:** 4/5 — primary sources from major vendors

### Claim Verification — NUMBERS ARE INFLATED
- **"SkillsMP indexes 425K+ skills":** ❌ INCORRECT. Web search finds SkillsMP had ~66,500 skills as of January 2026 (per SmartScope review). The 425K figure is unverified and likely conflates total indexed entries (including duplicates across versions/forks) with unique skills. **This is a 6.4x inflation.**
- **"agentskill.sh hosts 110K+":** ⚠️ UNVERIFIED. Could not independently confirm this number.
- **"LobeHub has 170K+":** ⚠️ UNVERIFIED. LobeHub is a real project but the skill count claim could not be independently confirmed.
- **"Spec is now supported by 20+ tools":** ⚠️ Confirmed for VS Code, Claude Code, Cursor, Codex/ChatGPT. "20+" is plausible but not independently enumerated.

### Corrections to Research Report
The ecosystem growth narrative is real — the spec IS being widely adopted. But the specific numbers are unreliable and should not be cited. The qualitative story (Anthropic published spec → OpenAI adopted → VS Code integrated → marketplaces emerged) is accurate and verifiable.

### Technical Feasibility for BookLib
- **Format alignment with agentskills.io spec:** ✅ BookLib already uses SKILL.md format. Need to verify field-level compliance.
- **`.well-known/agent-skills.json` endpoint:** ✅ Low effort — similar to existing .well-known work (already in IDEAS.md for MCP Server Cards)
- **Registry submission:** ✅ Zero-effort — submit existing skills to SkillsMP and skills.sh
- **No code changes required** for format alignment if BookLib's SKILL.md already matches the spec

### Competitive Value
- **Format compliance is table stakes.** Not a differentiator but a necessity. If BookLib's format diverges from the spec, discoverability drops.
- **Registry presence is free marketing.** Listing BookLib's 258 skills on SkillsMP and skills.sh increases discoverability at zero ongoing cost.
- **Quality differentiation remains valid.** Even with inflated ecosystem numbers, BookLib's curated expert knowledge is genuinely different from mass-produced skills.

### Deduplication Check
- **MCP Server Cards (IDEAS.md, 2026-03-31):** The `.well-known` endpoint work overlaps. Agent Skills spec uses `.well-known/agent-skills.json` while MCP uses `.well-known/mcp/server-card.json`. These are complementary, not duplicates — both should be generated.
- **ClawHavoc / security concerns (04-04, 04-06):** The ecosystem explosion context reinforces security concerns. Not a duplicate.

### Feature Proposal

**Title:** Align skill format with agentskills.io spec and register on marketplaces
**Description:** Audit BookLib's SKILL.md format against the agentskills.io specification for field-level compliance. Generate `.well-known/agent-skills.json` alongside the existing skill index. Submit BookLib's curated skills to SkillsMP and skills.sh for discoverability.
**Acceptance criteria:**
- Audit all 22 bundled skills against agentskills.io field requirements
- Fix any format divergences (if any)
- `booklib build-wellknown` generates both `server-card.json` (MCP) and `agent-skills.json` (skills spec)
- At least 22 bundled skills submitted to SkillsMP
- At least 22 bundled skills submitted to skills.sh
- README mentions compatibility with the Agent Skills specification
**Files to modify:** `bin/cli.js` (build-wellknown command), skill metadata, docs
**Dependencies:** None — can be done independently
**Priority:** P2 — low effort, high discoverability value

---

## Summary

| # | Finding | Verdict | Action |
|---|---------|---------|--------|
| 1 | Transformers.js v4 | 🔁 DUPLICATE | Already tracked (04-01, 🔥 Hot) |
| 2 | SEE Early-Exit Cross-Encoder | 🔁 DUPLICATE | Already tracked (04-01, 📋 Backlog) |
| 3 | GraphAnchor Iterative Graphs | ⚠️ PARTIALLY VALIDATED | Design reference for Spec 3 (P3) |
| 4 | BGE-M3 ONNX Unified Vectors | ❌ REJECTED | No Node.js support for multi-vector output |
| 5 | Qwen3-Embedding-0.6B | ✅ VALIDATED | Add as optional high-quality embedding model (P2) |
| 6 | RACG Survey | ✅ VALIDATED | Design input for eval harness (P3) |
| 7 | MCP 2026 Roadmap | 🔁 DUPLICATE | Already tracked (03-31, 🆕 New) |
| 8 | Agent Skills Ecosystem | ⚠️ PARTIALLY VALIDATED | Format alignment + registry submission (P2) |

**Net new actionable items:** 2 validated + 2 partially validated = 4 (of which 2 are design-only)
**Rejected:** 1 (BGE-M3 — claims don't hold for Node.js)
**Duplicates:** 3 (already tracked in IDEAS.md)

**Top recommendation:** Prioritize Finding 5 (Qwen3-Embedding-0.6B) after the Transformers.js v4 upgrade. It's the highest-impact new finding — confirmed ONNX+Transformers.js compatibility, dramatically better code retrieval quality, and a clean integration path via `embedding-provider.js`.

*Report generated 2026-04-07 by research validator.*
