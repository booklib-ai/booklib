# BookLib Validated Research Report — 2026-04-06

**Validator run:** 2026-04-06 | **Source report:** 2026-04-06-research.md
**Findings reviewed:** 4 | **Validated:** 3 | **Partially validated:** 1 | **Rejected:** 0

---

## Finding 1: SkillFlow v2 — 4-Stage Progressive Retrieval Pipeline

**Verdict:** ⚠️ PARTIALLY VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2504.06188](https://arxiv.org/abs/2504.06188)
- **Source type:** Preprint (not peer-reviewed)
- **Authors:** Fangzhou Li, Pagkratios Tagkopoulos, Ilias Tagkopoulos — UC Davis + USDA/NSF AI Institute
- **Open code:** ✅ [github.com/IBPA/skill-flow](https://github.com/IBPA/skill-flow)
- **Venue:** Arxiv preprint only. UC Davis is reputable but this is not a top-venue publication.
- **Credibility:** 3.5/5
### Claim Verification
- **36K SKILL.md corpus:** ✅ Confirmed by web search and GitHub repo
- **4-stage pipeline (dense → shallow rerank → deep rerank → LLM selection):** ✅ Confirmed
- **SkillsBench + Terminal-Bench evaluation:** ✅ Confirmed (87 tasks/229 skills + 89 tasks)
- **v2 is a major revision with new title:** ⚠️ CONCERN — v1 was "Efficient Skill and Code Transfer Through Communication in Adapting AI Agents" (a completely different paper about skill transfer between agents). v2 is "Scalable and Efficient Agent Skill Retrieval System" (a retrieval pipeline paper). Reusing the same arxiv ID for an essentially different paper is unusual and reduces confidence. Both the HTML version and GitHub confirm the v2 content, but this is not standard practice.

### Why Partially Validated
The core architectural insight (4-stage progressive narrowing with LLM-as-final-selector) is sound and independently verifiable from the paper content. The concern is the unusual v1→v2 metamorphosis, which suggests this work may still be in flux. The specific benchmark numbers should be cited with the caveat that this is a non-peer-reviewed preprint with an unusual revision history.

### Technical Feasibility for BookLib
- **Node.js + @xenova/transformers:** ✅ The pipeline architecture is model-agnostic — BookLib can implement the 4-stage pattern with its existing stack
- **Latency:** ⚠️ Adding a 4th stage (LLM selection) adds Haiku API latency (~200-500ms). Already present in synthesizer path, so no regression for `booklib context`
- **CPU-only:** ✅ Pipeline architecture doesn't require GPU
- **Memory:** Neutral — no new models beyond what's already planned (BGE-reranker-v2-m3 from 04-05)
- **API contract:** ✅ No breaking changes — stages are internal to `searcher.js`

### Competitive Value
- **Genuine differentiator?** Moderate. The insight that BookLib already approximates SkillFlow is the main value. Formalizing the 4-stage architecture is good engineering practice but not user-facing.
- **Unique positioning?** The 36K corpus as a benchmark target is more actionable than the architecture itself.

### Deduplication Check
- **SkillRouter (04-05):** Different focus — SkillRouter is about training methodology (listwise loss, hard negatives), SkillFlow is about pipeline architecture. NOT A DUPLICATE.
- **SEE early-exit reranker (04-01/IDEAS.md):** SkillFlow's "shallow reranker" stage maps to SEE. OVERLAPS but adds the new framing of shallow+deep as complementary. Not a duplicate — it REINFORCES the existing idea.
- **BGE-reranker-v2-m3 (04-05):** SkillFlow is architecture, BGE is the concrete model. Complementary. NOT A DUPLICATE.

### Feature Proposal

**Title:** Formalize BookLib's retrieval pipeline as 4-stage architecture
**Description:** Restructure `searcher.js` to explicitly implement 4 named stages: (1) BM25+vector hybrid retrieval, (2) shallow reranking (SEE early-exit or lightweight scorer), (3) deep reranking (BGE-reranker-v2-m3), (4) LLM synthesis/selection (existing Haiku synthesizer). Each stage is a pluggable module with a consistent interface.
**Acceptance criteria:**
- Pipeline stages are named and documented in code
- Each stage can be independently enabled/disabled via config
- `booklib search --stages` shows which stages ran and their latency
- Benchmark compares 2-stage (current) vs 3-stage vs 4-stage results
- No regression in default search latency (<500ms target)
**Files to modify:** `lib/engine/searcher.js`, `lib/engine/reranker.js`, `benchmark/`
**Dependencies:** Spec 2 hybrid pipeline must be stable first; BGE-reranker-v2-m3 integration (04-05)
**Priority:** P2 — good engineering practice but not urgent; the architecture already works implicitly
---

## Finding 2: SoK: Agentic Skills — Seven Design Patterns + ClawHavoc

**Verdict:** ✅ VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2602.20867](https://arxiv.org/abs/2602.20867)
- **Source type:** Preprint — Systematization of Knowledge (SoK) paper
- **Authors:** Yanna Jiang + 6 co-authors (confirmed multi-author)
- **Date:** February 24, 2026 (confirmed)
- **Venue:** Arxiv preprint. SoK papers are a recognized academic format with rigorous systematization methodology.
- **Credibility:** 4/5

### Claim Verification
- **Full skill lifecycle taxonomy (discovery → practice → distillation → storage → composition → evaluation → update):** ✅ Confirmed by arxiv abstract and web results
- **Two complementary taxonomies (system-level design patterns + evaluation approaches):** ✅ Confirmed
- **ClawHavoc case study:** ✅ INDEPENDENTLY CONFIRMED. ClawHavoc is a well-documented real-world incident:
  - Initially 341 malicious skills found (February 2026, reported by HackerNews, Repello AI)
  - Scaled to **1,184 malicious skills** per Antiy CERT analysis (12 author IDs)
  - Eventually **1,467 total** found across ClawHub marketplace
  - Targeted OpenClaw's ClawHub marketplace (not a generic "major marketplace")
  - Attack techniques: prompt injection in SKILL.md descriptors, hidden reverse shells, token exfiltration via CVE-2026-25253
  - Exfiltrated: ~/.clawdbot/.env (API keys), browser credential stores, cryptocurrency wallets
  - Payloads included Atomic macOS Stealer (AMOS) and cryptominers
  - One skill had 340,000+ installs before detection
  - **Note:** The research report says "nearly 1,200 malicious skills" — Antiy CERT counted 1,184. Accurate.

### Corrections to Research Report
- The research report presents ClawHavoc as primarily from the SoK paper. In reality, ClawHavoc is independently documented across multiple security outlets (HackerNews, Repello AI, Antiy Labs, CyberPress, Snyk). The SoK paper includes it as a case study, but BookLib should cite the primary security reports for ClawHavoc, not just the SoK.
- The marketplace is specifically **OpenClaw's ClawHub**, not an unnamed "major agent marketplace."

### Technical Feasibility for BookLib
- **Design pattern mapping (docs/positioning):** ✅ Zero code effort — documentation work
- **Trust-tiered execution in `skill-fetcher.js`:** ✅ Feasible in Node.js. Three tiers (built-in/curated/community) with different verification levels. Aligns with existing SkillTester 3-level labeling (safe/caution/unsafe) already in IDEAS.md.
- **ClawHavoc citation in security docs:** ✅ Zero effort — use primary security reports
- **Lifecycle taxonomy for roadmap organization:** ✅ Documentation exercise

### Competitive Value
- **The 7 design patterns are a marketing/positioning asset.** Mapping BookLib's features to formally named patterns from a SoK paper strengthens academic credibility.
- **ClawHavoc is the most compelling security argument available.** 1,184+ malicious skills, AMOS stealer, CVE exploitation, 340K+ installs on a single malicious skill — this is concrete and dramatic.
- **Trust-tiered execution is table stakes** for any skill management tool. Implementing it positions BookLib correctly but doesn't differentiate.

### Deduplication Check
- **"Agent Skills for LLMs" survey (04-03, arxiv:2602.12430):** Different paper, different scope. The survey covers 4 axes broadly; this SoK provides prescriptive design patterns and a real security case study. NOT A DUPLICATE.
- **ClawHavoc 341 skills (03-31 security alert):** The 03-31 report noted the initial 341 count. Today's SoK adds the full 1,184 count from Antiy CERT + the formal design patterns framing. PARTIAL OVERLAP — update the 03-31 reference with the larger count rather than creating a new entry.
- **SkillTester 3-level labeling (04-03/IDEAS.md):** Trust-tiered execution overlaps with the safe/caution/unsafe labeling. OVERLAPS — update existing IDEAS.md entry rather than creating new one.

### Feature Proposal

**Title:** Map BookLib features to SoK's 7 design patterns + cite ClawHavoc in security docs
**Description:** Create a RESEARCH.md section mapping BookLib's architecture to each of the 7 formally named design patterns from the SoK. Update security documentation with ClawHavoc incident data (1,184 malicious skills, CVE-2026-25253, AMOS stealer) as the primary argument for `booklib audit` and `booklib fetch` security features.
**Acceptance criteria:**
- RESEARCH.md maps BookLib features to each of the 7 SoK design patterns
- Security docs cite ClawHavoc with primary sources (Antiy CERT, Repello AI, HackerNews)
- `booklib fetch` warning text references real-world incident scale
- Trust tier labels (built-in/curated/community) documented in security architecture
- Lifecycle taxonomy (7 stages) used to organize feature roadmap in docs
**Files to modify:** `benchmark/RESEARCH.md`, `docs/security.md`, `lib/skill-fetcher.js`
**Dependencies:** None — documentation and messaging work
**Priority:** P1 — low effort, high positioning value
---

## Finding 3: Skill-Inject — 80% Attack Success Rate Benchmark

**Verdict:** ✅ VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2602.20156](https://arxiv.org/abs/2602.20156) (v3: February 25, 2026)
- **Source type:** Preprint — multi-author security research
- **Authors:** David Schmotz, Luca Beurer-Kellner, Sahar Abdelnabi, Maksym Andriushchenko
  - Beurer-Kellner: ETH Zurich SRI Lab (same lab as the context file study already in IDEAS.md)
  - Abdelnabi: known adversarial ML researcher
  - Andriushchenko: known for adversarial robustness work
- **Open code:** ✅ [github.com/aisa-group/skill-inject](https://github.com/aisa-group/skill-inject)
- **Dedicated website:** ✅ [skill-inject.com](https://www.skill-inject.com/)
- **Venue:** Arxiv preprint, but author team is exceptionally strong (ETH Zurich security lab)
- **Credibility:** 4.5/5 — strong author team, open benchmark, reproducible methodology
### Claim Verification
- **202 injection-task pairs:** ✅ Confirmed across multiple sources
- **Up to 80% attack success rate with frontier models:** ✅ Confirmed (arxiv abstract, skill-inject.com, multiple coverage articles)
- **Attack types (data exfiltration, destructive ops, ransomware-like behavior):** ✅ Confirmed
- **SkillJect companion paper (arxiv:2602.14211):** ✅ Confirmed — Peking University, automated attack generation
- **Note:** Research report says "v2" but latest is actually v3 (Feb 25, 2026). Minor inaccuracy, doesn't affect substance.

### Technical Feasibility for BookLib
- **Adopting 202-pair benchmark:** ✅ Feasible. The pairs are SKILL.md-format files — BookLib's parser can read them directly. Would need a test harness wrapper.
- **Detection heuristics for 3 attack categories:** ✅ All implementable in Node.js:
  - Exfiltration: regex scan for `fetch`, `http`, `curl`, `wget` in skill content + referenced scripts
  - Destruction: regex scan for `rm -rf`, `fs.unlink`, `exec`, `spawn` patterns
  - Behavioral/subtle: Harder — requires semantic analysis or LLM-in-the-loop. Flag as future work.
- **`booklib audit --security` command:** ✅ Feasible as CLI extension to existing `booklib audit`
- **Latency impact:** Negligible — security scanning is offline, not in the search path

### Competitive Value
- **The 80% figure is the most compelling security stat available.** It's an attack SUCCESS rate, not just a vulnerability PRESENCE rate. Much more alarming than "26.1% contain vulnerabilities."
- **The benchmark is reusable for marketing.** "BookLib's security scanner detects X% of Skill-Inject attacks" is a concrete, falsifiable claim.
- **Genuine differentiator:** No competitor offers skill security benchmarking against a standardized attack suite.

### Deduplication Check
- **SkillTester security probes (04-03/IDEAS.md):** SkillTester provides the DETECTION framework (safe/caution/unsafe). Skill-Inject provides the ATTACK benchmark to test detection against. Complementary, NOT A DUPLICATE.
- **"Malicious Or Not" repo context (04-04):** "Malicious Or Not" addresses FALSE POSITIVE reduction. Skill-Inject addresses ATTACK COVERAGE measurement. Different concerns. NOT A DUPLICATE.
- **26.1% vulnerability rate (04-03 survey):** Skill-Inject's 80% is a different metric (attack success on frontier models vs. vulnerability presence in marketplace). Complementary. NOT A DUPLICATE.

### Feature Proposal

**Title:** Adopt Skill-Inject benchmark for security scanner evaluation
**Description:** Integrate Skill-Inject's 202 injection-task pairs as a standardized test suite for `booklib audit --security`. Implement detection heuristics targeting the three attack categories identified by SkillJect. Report detection rates as a security quality metric.
**Acceptance criteria:**
- `benchmark/security/` directory contains adapted Skill-Inject test pairs
- `booklib audit --security` runs content-based detection heuristics
- Detection covers: exfiltration patterns, destructive operations, encoded payloads
- Benchmark reports detection rate (% of Skill-Inject attacks caught)
- Security docs cite the 80% attack success rate as motivation
**Files to modify:** `lib/skill-verifier.js`, `benchmark/security/` (new), `bin/cli.js`, `docs/security.md`
**Dependencies:** SkillTester 3-level labeling (04-03) for output format; "Malicious Or Not" repo context (04-04) for false positive reduction
**Priority:** P1 — high impact for positioning and genuine user safety value
---

## Finding 4: EvoSkill — Failure-Driven Skill Evolution

**Verdict:** ✅ VALIDATED

### Source Verification
- **Paper exists:** ✅ Confirmed at [arxiv:2603.02766](https://arxiv.org/abs/2603.02766)
- **Source type:** Preprint — 5 authors from Sentient AGI
- **Authors:** Salaheddin Alzubi, Noah Provenzano, Jaydon Bingham, Weiyuan Chen, Tu Vu (confirmed)
- **Open code:** ✅ [github.com/sentient-agi/EvoSkill](https://github.com/sentient-agi/EvoSkill)
- **Date:** March 3, 2026 (confirmed)
- **Venue:** Arxiv preprint. Sentient AGI is a newer lab — lower institutional prestige than UC Davis or ETH Zurich.
- **Credibility:** 3.5/5 — open code and reproducible results offset the newer lab origin

### Claim Verification
- **+7.3% on OfficeQA with Claude Code + Opus 4.5 (60.6% → 67.9%):** ✅ Confirmed
- **+12.1% on SealQA (26.6% → 38.7%):** ✅ Confirmed
- **Zero-shot transfer to BrowseComp +5.3%:** ✅ Confirmed
- **Pareto frontier for skill selection:** ✅ Confirmed
- **Failure-driven iterative refinement approach:** ✅ Confirmed — this is the key distinction from one-shot generation
- **Skills are structured SKILL.md-format artifacts:** ✅ Confirmed

### Technical Feasibility for BookLib
- **Adopting EvoSkill's benchmarks (OfficeQA, SealQA):** ✅ Low effort — add as optional eval targets
- **`booklib evolve` command:** ⚠️ Medium-high effort. Requires LLM access for failure analysis and skill rewriting. Conflicts somewhat with BookLib's local-first identity (skill evolution needs LLM calls). Could work as an opt-in cloud feature.
- **Pareto frontier for quality gating:** ✅ Feasible concept but requires a task benchmark to measure skill utility — depends on Spec 2 eval harness being complete.
- **Competitive landscape docs update:** ✅ Zero effort

### Competitive Value
- **The SkillsBench 0% vs EvoSkill +7.3% contrast is a nuanced positioning story.** It validates curation while showing that iterative refinement (not one-shot generation) can also work. BookLib should own this narrative.
- **Not an immediate threat to BookLib.** EvoSkill requires significant compute (LLM-in-the-loop) and doesn't match the breadth of curated expert knowledge. BookLib's value is in the delivery mechanism + curation quality.
- **Zero-shot transfer finding is a marketing asset.** "Skills built for one task improve others" supports BookLib's general-purpose skill approach.

### Deduplication Check
- **SkillsBench "zero benefit from self-generated skills" (04-04):** EvoSkill directly contrasts this finding — iterative refinement works where one-shot generation fails. This is NEW insight, NOT A DUPLICATE.
- **SKILL0 model internalization (04-05 "Also Noted"):** Different approach entirely (model fine-tuning vs. skill file evolution). NOT A DUPLICATE.

### Feature Proposal

**Title:** Document EvoSkill's iterative refinement finding in competitive landscape
**Description:** Update competitive positioning docs with the nuanced story: one-shot skill generation = 0% benefit (SkillsBench), iterative failure-driven evolution = +7.3% (EvoSkill), curated expert skills = +16.2pp (SkillsBench). This three-way comparison positions BookLib's curation approach while acknowledging the iterative refinement direction as a future opportunity.
**Acceptance criteria:**
- Competitive landscape docs include the three-way comparison
- README or marketing cites: "Curated skills +16.2pp, auto-evolved +7.3%, self-generated +0%"
- Future `booklib evolve` concept noted in roadmap as a post-v2.0 exploration
- EvoSkill's Pareto frontier concept noted as a quality gating pattern for `booklib audit`
**Files to modify:** `docs/competitive-landscape.md`, `README.md`, roadmap docs
**Dependencies:** None for docs update; Spec 2 eval harness for any Pareto frontier implementation
**Priority:** P2 — valuable positioning insight but no immediate code needed
---

## Validation Summary

| # | Finding | Verdict | Priority | Key Action |
|---|---------|---------|----------|------------|
| 1 | SkillFlow v2 — 4-stage pipeline | ⚠️ PARTIALLY VALIDATED | P2 | Formalize pipeline stages in searcher.js |
| 2 | SoK: Agentic Skills — 7 patterns + ClawHavoc | ✅ VALIDATED | P1 | Map features to design patterns; cite ClawHavoc |
| 3 | Skill-Inject — 80% attack success benchmark | ✅ VALIDATED | P1 | Adopt benchmark for security scanner testing |
| 4 | EvoSkill — failure-driven skill evolution | ✅ VALIDATED | P2 | Update competitive positioning docs |

### Cross-Cutting Assessment

Today's findings are solid. Three of four papers are fully validated with strong source quality (ETH Zurich security researchers on Skill-Inject, a real SoK paper with independently verifiable ClawHavoc data, and a reproducible EvoSkill framework). The SkillFlow v2 paper is the weakest link due to its unusual arxiv revision history, but the architectural insights are sound regardless.

**The security narrative is now overwhelming.** The progression across all reports:
- 341 → 1,184 malicious skills in ClawHavoc (documented by Antiy CERT, HackerNews, Repello AI)
- 26.1% vulnerability rate in marketplace skills (survey, 04-03)
- 46.8% false positive rate in naive scanning (04-04)
- **80% attack success rate on frontier models** (Skill-Inject, today)
- CVE-2026-25253 exploited in the wild (ClawHavoc)
- AMOS (Atomic macOS Stealer) delivered via skill files (ClawHavoc)

This is no longer theoretical. BookLib's security features (`booklib audit`, `booklib fetch` verification) have a clear, citable, urgent justification.

**The retrieval pipeline is now fully blueprinted.** Between SkillRouter (04-05), BGE-reranker-v2-m3-ONNX (04-05), SkillFlow v2 (today), and the existing Spec 2 design, BookLib has two reference architectures, a concrete ONNX model, and now a 4-stage formalization to draw from.

**Priority recommendation:** Focus on the two P1 items:
1. Security messaging + Skill-Inject benchmark adoption (Findings 2+3 compound)
2. SoK design pattern mapping (Finding 2 — low effort, high credibility impact)

---

*Validated by research-validator scheduled task on 2026-04-06.*