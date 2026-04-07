# BookLib Validated Research Report — 2026-04-04

**Source document:** `2026-04-03-research.md` (standard daily scan — 5 findings)
**Findings reviewed:** 5
**✅ Validated:** 1 | **⚠️ Partially validated:** 3 | **❌ Rejected:** 1
**Duplicates:** 1 (partial — Finding 4 overlaps with project's existing foundational reference)

> **Note:** The 2026-04-03-research.md standard scan was not validated on April 3 (only the separate lightrag-ideas analysis was validated that day). This report validates the standard scan's 5 findings.

---

## Finding 1: AgentSkillOS — Capability-Tree Discovery + DAG Orchestration — ⚠️ PARTIALLY VALIDATED

**Paper:** [AgentSkillOS: Organizing, Orchestrating, and Benchmarking Agent Skills at Ecosystem Scale](https://arxiv.org/abs/2603.02176) (March 2, 2026)
**Authors:** Hao Li, Chunjiang Mu, Jianhao Chen et al. — Shanghai AI Laboratory
**Source type:** Preprint — NOT peer-reviewed
**Code:** [github.com/ynulihao/AgentSkillOS](https://github.com/ynulihao/AgentSkillOS) — open source
**Source quality:** 3/5 — major national lab, multiple authors, open code, BUT not peer-reviewed. Claims are plausible but unverified by independent replication.

**Claims verified:**
- ✅ Capability tree via recursive categorization — confirmed in paper and code
- ✅ DAG-based skill orchestration — confirmed
- ✅ Benchmarked on 200 to 200K skills — confirmed, 30 tasks across 5 categories
- ✅ Tree-based retrieval approximates oracle selection at scale — confirmed in paper's experiments

**Technical feasibility CONCERNS:**
- ⚠️ **Scale mismatch.** BookLib has ~22 bundled skills and ~258 discoverable skills. The paper benchmarks at 200–200K. At BookLib's current scale, flat vector+BM25 search (already implemented in Spec 2) handles skill selection fine. Hierarchical search adds complexity without measurable benefit until skill counts reach 500+.
- ⚠️ **Taxonomy field is zero-cost but two-phase search is overkill.** Adding a `taxonomy` field to YAML frontmatter is trivial metadata enrichment. But implementing two-phase search (narrow to taxonomy subtree → vector search within subtree) requires restructuring `searcher.js` for marginal gain at current corpus size.
- ⚠️ **DAG orchestration is architecturally incompatible.** BookLib is a search-and-inject tool — it finds relevant skills and injects context. DAG-based multi-skill pipelines would require a fundamentally different execution model. The research report frames this as "could inform a future `booklib plan` command" — that's speculative, not actionable.
- ✅ **The taxonomy metadata IS useful.** Even without two-phase search, a `taxonomy` field in skill frontmatter enables better BM25 matching and could be used for filtering in `booklib search --category=...`. Low effort, incremental value.

**Competitive value:** LOW at current scale. The paper solves a problem BookLib doesn't have yet. When BookLib reaches 500+ skills, revisit.

**Project alignment:** Loosely aligned with Spec 1 (ecosystem). The taxonomy field fits into Spec 1's frontmatter enrichment work (1.1). The two-phase search and DAG orchestration are out of scope.

**Deduplication check:** No overlap with existing IDEAS.md entries.

### Feature Proposal (narrow scope — taxonomy metadata only)

**Title:** Add optional `taxonomy` field to skill YAML frontmatter
**Description:** Add a hierarchical `taxonomy` array field (e.g., `[languages, typescript, patterns]`) to skill frontmatter for future category-based filtering and improved BM25 matching. Does NOT require two-phase search implementation — just metadata enrichment alongside Spec 1.1's existing frontmatter work.
**Acceptance criteria:**
- `taxonomy` field added to skill frontmatter schema (optional, array of strings)
- 22 bundled skills annotated with taxonomy paths
- `booklib search --category=<term>` filters results by taxonomy prefix match
- No changes to core search pipeline in `searcher.js`
**Files to modify:** All 22 `skills/*/SKILL.md`, skill schema docs
**Dependencies:** Spec 1.1 frontmatter enrichment
**Priority:** P3

---

## Finding 2: SkillTester — Comparative Skill Utility + Security Benchmarking — ⚠️ PARTIALLY VALIDATED

**Paper:** [SkillTester: Benchmarking Utility and Security of Agent Skills](https://arxiv.org/abs/2603.28815) (March 28, 2026)
**Authors:** Peking University + Northwestern Polytechnical University
**Source type:** Preprint — NOT peer-reviewed
**Code/Service:** [skilltester.ai](https://skilltester.ai), [github.com/skilltester-ai/skilltester](https://github.com/skilltester-ai/skilltester)
**Source quality:** 3/5 — top Chinese universities, novel methodology, deployed service. But preprint, and comparative utility claims need independent validation.

**Claims verified:**
- ✅ Comparative utility measurement (with-skill vs. without-skill) — confirmed in paper
- ✅ Three-level security status labels (safe/caution/unsafe) — confirmed
- ✅ Security probe suite covering abnormal behavior, permission boundary, sensitive data — confirmed
- ⚠️ The research report attributes "26.1% vulnerability rate" to this paper — **INCORRECT.** That stat comes from arxiv:2602.12430 (the survey). SkillTester references a separate Snyk audit (534 critical issues, 1,467 with any flaw, 76 malicious payloads out of 3,984 skills = ~37% flaw rate, ~1.9% malicious rate). Different numbers, different source.

**Technical feasibility CONCERNS:**
- ⚠️ **Comparative utility requires end-to-end agent evaluation.** To measure whether a skill helps, you need: (a) an LLM running real tasks, (b) a task suite with ground truth, (c) paired runs (with/without skill). This is expensive ($$$), slow, and outside BookLib's current architecture. BookLib injects context — it doesn't execute tasks.
- ⚠️ **`booklib bench` would measure retrieval quality, not skill utility.** The research report conflates retrieval benchmarking (Spec 2's eval harness) with skill utility testing. These are different things. BookLib can measure "did we retrieve the right skill?" but not "did the skill make the agent better?" without an LLM-in-the-loop eval.
- ✅ **Security probe patterns are adoptable.** SkillTester's security probes (URL pattern detection, shell command detection, encoded content, prompt injection) map directly to `booklib audit`'s static analysis. The three-level labeling (safe/caution/unsafe) is a good UX pattern for `booklib fetch` warnings.
- ✅ **The Snyk audit numbers are citable.** 534 critical / 3,984 scanned is a concrete data point for security messaging.

**Competitive value:** MEDIUM for security features, LOW for comparative utility at BookLib's current scope.

**Project alignment:** Security probes align with existing `booklib audit` (already in IDEAS.md). Comparative utility is out of scope for foreseeable roadmap.

**Deduplication check:** The security aspects overlap with the existing "Research-backed skill content guidelines + audit command" idea in IDEAS.md. The security probe details are NEW and additive to that existing entry.

### Feature Proposal (narrow scope — security probes only)

**Title:** Add SkillTester-inspired security probes to `booklib audit`
**Description:** Extend `auditor.js` with security-focused static analysis probes: detect URL patterns, shell command injection vectors, encoded/obfuscated content, and prompt injection markers in skill files. Output a three-level security label (safe/caution/unsafe) alongside existing token count warnings.
**Acceptance criteria:**
- `booklib audit` runs security probes against skill content
- Probes check for: suspicious URLs, shell commands (`exec`, `spawn`, backticks), base64/hex-encoded strings, prompt injection patterns ("ignore previous", "you are now")
- Output includes security label: ✅ safe / ⚠️ caution / 🚫 unsafe
- `booklib fetch` shows security label before installing third-party skills
- Snyk audit stats cited in security documentation
**Files to modify:** `lib/engine/auditor.js`, `bin/cli.js` (fetch command)
**Dependencies:** None
**Priority:** P2

---

## Finding 3: Configuring Agentic AI Coding Tools — Skills Adoption Is Shallow — ✅ VALIDATED

**Paper:** [Configuring Agentic AI Coding Tools: An Exploratory Study](https://arxiv.org/abs/2602.14690) (Feb 16, 2026; v2 Mar 20, 2026)
**Authors:** Matthias Galster, Seyedmoein Mohsenimofidi, Jai Lal Lulla, Muhammad Auwal Abubakar, Christoph Treude, Sebastian Baltes — 6 authors, established SE researchers
**Source type:** Preprint — NOT peer-reviewed, but v2 iteration suggests active refinement. Galster and Treude are well-known in SE research.
**Source quality:** 4/5 — credible researchers, empirical study of 2,923 repos, systematic methodology. Not peer-reviewed but high-quality empirical work.

**Claims verified:**
- ✅ 8 configuration mechanisms identified (Context Files, Skills, Subagents, Rules, Hooks, MCP Servers, Custom Commands, Templates) — confirmed in paper
- ✅ 2,923 GitHub repositories analyzed — confirmed
- ✅ Context Files dominate adoption — confirmed
- ✅ Skills and Subagents have shallow adoption — confirmed
- ✅ Most repos use only 1-2 mechanisms — confirmed
- ⚠️ Research report says "AGENTS.md is emerging as an interoperable standard" — this is the report's interpretation, not a direct paper claim. The paper shows Context Files dominate but doesn't single out AGENTS.md specifically.

**Technical feasibility:**
- ✅ **`booklib export --format=agents-md` is straightforward.** BookLib skills are XML-tagged markdown. Converting to flat AGENTS.md/CLAUDE.md format is a parser transformation — extract core_principles and anti_patterns, format as plain markdown. The parser already handles these tags.
- ✅ **`booklib import --from=agents-md` is feasible but heuristic.** Converting unstructured markdown into BookLib's XML-tagged format requires heuristic section detection. Can start with simple heading-based parsing (## Principles → `<core_principles>`, ## Avoid → `<anti_patterns>`). Won't handle all cases but covers the 80%.
- ✅ **No new dependencies.** Both export and import are pure text transformations using existing parser infrastructure.
- ✅ **Aligns with Spec 1.4.** Extended agent compatibility already adds support for writing to CLAUDE.md, .cursorrules, etc. Import/export is the bidirectional version of this — natural extension.

**Competitive value:** HIGH. This is a genuine gap in the ecosystem. No other tool offers bidirectional conversion between context files and structured skills. The study confirms context files dominate but skills are underused — the bridge is exactly what's needed to drive adoption.

**Project alignment:** Directly supports Spec 1 (ecosystem alignment). The export command fits naturally alongside the installer writers in `lib/installer.js`. Import could be a new `lib/importer.js` module.

**Deduplication check:** No overlap with existing IDEAS.md entries. The Lulla et al. connection (Lulla is a co-author on both 2602.14690 and 2601.20404) doesn't create a duplicate — the papers address different questions (adoption patterns vs. efficiency impact).

### Feature Proposal

**Title:** Add bidirectional context file conversion (import/export)
**Description:** Implement `booklib export --format=agents-md` to convert skills into flat context file formats (AGENTS.md, CLAUDE.md, .cursorrules) and `booklib import --from=agents-md` to convert existing context files into BookLib skills with XML tags. Bridges the dominant but unstructured context file pattern with BookLib's structured skill format.
**Acceptance criteria:**
- `booklib export --format=agents-md <skill-name>` outputs skill content as flat markdown
- `booklib export --format=cursorrules <skill-name>` outputs as .cursorrules format
- `booklib import --from=agents-md <file>` creates a new skill with XML tags from plain markdown
- Import uses heuristic heading detection (## Principles → `<core_principles>`, etc.)
- Round-trip test: export → import → export produces semantically equivalent output
- Cite Galster et al. adoption data in command help text and docs
**Files to modify:** `bin/cli.js`, `lib/installer.js` (export), new `lib/importer.js` (import), `lib/engine/parser.js` (shared parsing logic)
**Dependencies:** None
**Priority:** P1

---

## Finding 4: Agent Skills for LLMs Survey — SKILL.md Formalization + 26.1% Vuln Rate — ❌ REJECTED (DUPLICATE)

**Paper:** [Agent Skills for Large Language Models: Architecture, Acquisition, Security, and the Path Forward](https://arxiv.org/abs/2602.12430) (Feb 12, 2026; v3 Feb 17, 2026)
**Authors:** Renjun Xu, Yang Yan — **2 authors, not "multiple" as the research report claims**
**Source type:** Preprint survey — NOT peer-reviewed
**Source quality:** 3/5 — comprehensive survey, v3 iteration, cited by subsequent papers. But only 2 authors, and survey papers have lower novelty threshold than empirical work.

**REJECTION REASON: Already embedded in the project's foundations.**

This paper (arxiv:2602.12430) is **already cited in the roadmap design document** (`docs/specs/2026-03-31-booklib-roadmap-design.md`):
> "Research across agentskills.io, skills.sh, anthropics/skills, microsoft/skills, QMD, txtai, and **arxiv 2602.12430** revealed two independent growth vectors for BookLib..."

The paper is foundational to BookLib's entire three-spec architecture. Every proposal in the research report's Finding 4 is either:
1. **Already done:** SKILL.md format already aligns with the survey's description (BookLib IS the implementation)
2. **Already planned:** RESEARCH.md is explicitly part of Spec 3.3
3. **Documentation/marketing tasks, not features:** "Cite the 26.1% stat", "reach out to survey authors", "use their terminology in docs"

**Specific issues:**
- The research report says "multiple authors" — it's 2 authors. Minor inaccuracy but reveals insufficient source checking.
- The proposals are almost entirely documentation/positioning work. The only engineering-adjacent item (aligning SKILL.md format) is a no-op since BookLib's format IS the format the survey describes.
- The 26.1% vulnerability stat is useful for marketing but doesn't require a validated feature proposal — it's a copywriting task.

**What's salvageable:** The 26.1% stat and the G1-G4 security gates framework could be added as a note to the existing "Research-backed skill content guidelines" entry in IDEAS.md. Not worth a standalone entry.

---

## Finding 5: MCP v1.27 SDK Tiering (SEP-1730) — ⚠️ PARTIALLY VALIDATED

**Source:** [MCP v1.27.1 Release](https://modelcontextprotocol.io/specification/2025-11-25/changelog) + [SEP-1730](https://modelcontextprotocol.io/seps/1730-sdks-tiering-system) + [MCP Ecosystem in 2026 blog](https://www.contextstudios.ai/blog/mcp-ecosystem-in-2026-what-the-v127-release-actually-tells-us)
**Source type:** Official MCP specification + third-party analysis blog
**Source quality:** 5/5 for the specification itself (first-party). 2/5 for the blog post (third-party analysis, not official).

**Claims verified:**
- ✅ SEP-1730 SDK Tiering System exists — confirmed at modelcontextprotocol.io
- ✅ v1.27.1 added conformance testing and tier documentation — confirmed
- ✅ Command injection vulnerability fix in URL handling — confirmed
- ⚠️ "Q2 2026 enterprise OAuth 2.1 + PKCE auth" — this comes from the BLOG POST, not the official spec. The blog (contextstudios.ai) is third-party analysis, not official MCP roadmap. Cannot confirm this timeline from first-party sources.
- ⚠️ "Q4 2026 MCP Registry with security audits" — also from the blog, not confirmed by official sources.

**Technical feasibility:**
- ✅ **Conformance testing is practical.** Running MCP conformance tests against BookLib's server is a normal testing task. Low effort, high value for ecosystem trust.
- ✅ **Reviewing tier requirements is a checklist exercise.** Not engineering innovation — compliance work.
- ⚠️ **OAuth 2.1 planning is premature.** The Q2 2026 timeline is unconfirmed. Don't plan for it until official spec drops.
- ⚠️ **MCP Registry preparation is speculative.** Q4 2026 is 6+ months away and the timeline is from a third-party blog.

**Competitive value:** MEDIUM. SDK tier compliance is table stakes for any serious MCP server. Not a differentiator but a requirement.

**Project alignment:** Spec 1 (ecosystem alignment). The MCP Server Cards entry in IDEAS.md (2026-03-31) already covers MCP ecosystem compliance. This adds the conformance testing angle.

**Deduplication check:** Partially overlaps with "MCP Server Cards" entry in IDEAS.md. The server card is about discovery; the tiering is about compliance. Different enough to warrant a note on the existing entry rather than a new entry.

### Feature Proposal (narrow scope — conformance testing only)

**Title:** Add MCP SDK conformance tests targeting SEP-1730 tier compliance
**Description:** Run BookLib's MCP server against the official MCP SDK conformance test suite to verify spec compliance. Document which SDK tier BookLib currently meets. Fix any URL handling patterns affected by the v1.27.1 security patch.
**Acceptance criteria:**
- MCP conformance tests added to BookLib's test suite
- Current tier level documented in MCP server README
- URL handling reviewed against v1.27.1 security advisory
- Any conformance failures fixed
**Files to modify:** `test/`, `lib/mcp/server.js`
**Dependencies:** None
**Priority:** P2

---

## Summary Table

| # | Finding | Status | Source Quality | Priority | Effort |
|---|---------|--------|---------------|----------|--------|
| 1 | AgentSkillOS — capability-tree discovery | ⚠️ Partial | 3/5 (preprint, major lab) | P3 | Low (metadata only) |
| 2 | SkillTester — security probes | ⚠️ Partial | 3/5 (preprint, top universities) | P2 | 0.5–1 day |
| 3 | Configuring Agentic AI — import/export | ✅ Validated | 4/5 (preprint, established researchers) | P1 | 1–2 days |
| 4 | Agent Skills survey | ❌ Rejected | 3/5 (survey, 2 authors) | — | — (already foundational) |
| 5 | MCP SDK Tiering — conformance tests | ⚠️ Partial | 5/5 (official spec) | P2 | 0.5 day |

## Cross-Cutting Analysis

**One genuinely actionable finding.** Finding 3 (bidirectional context file conversion) is the standout. It addresses a real gap confirmed by empirical data (2,923 repos showing context files dominate but skills are underused), aligns perfectly with Spec 1, and requires no novel engineering — just parser transformations on existing infrastructure. This is a P1 that should be picked up.

**The rest is incremental.** Findings 1, 2, and 5 each contribute a narrow, low-effort improvement (taxonomy metadata, security probes, conformance tests) but none is transformative. They're good backlog items, not priorities.

**Finding 4 was a miss.** The research scan should have caught that arxiv:2602.12430 is already foundational to the project. Including it as a "finding" inflates the report's apparent value. The scan's deduplication check against prior reports worked (the paper wasn't in previous scans) but didn't check against the project's own specs and roadmap.

**Quality observation about the research scan.** Today's scan skewed toward ecosystem/positioning papers (3 of 5) rather than retrieval/engineering papers. This may reflect the current arxiv landscape or the scanner's search terms. The most engineering-impactful recent findings (LightRAG dual-level routing, graph neighbor hydration) came from the targeted lightrag-ideas analysis, not the daily scan. Consider adjusting scan parameters to weight retrieval/search papers higher.

**Net new actionable items: 1 (P1) + 3 (P2/P3 backlog updates).**

---
*Validated by daily-research-validator on 2026-04-04.*
