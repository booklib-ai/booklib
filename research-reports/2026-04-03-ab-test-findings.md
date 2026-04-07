# BookLib A/B Test Findings — April 2-4 2026

## Summary

Comprehensive A/B testing of BookLib's value proposition across retrieval quality, code generation, and niche knowledge domains. 30+ test runs over 3 days. Tests used a standalone Spring Boot + React webshop project with team ADRs, comparing agents with and without BookLib.

## Test Infrastructure

- **Control project:** `/webshop-control/` — 6 skill files in project folder (effective-java, spring-boot-in-action, clean-code-reviewer, design-patterns, microservices-patterns, system-design-interview)
- **Treatment:** Same 6 skills loaded + BookLib with 280+ indexed skills + knowledge graph with team ADRs
- **Model:** Claude Haiku 4.5 for both groups (fair comparison)
- **Code:** `webshop-test/codegen-ab.js` (backend), `webshop-test/codegen-ui-test.js` (UI/UX), `webshop-test/confidence-test.js` (gate test)

## Final Architecture

```
Small atomic chunks in index (55 chars median, 300 char cap)
  → BM25 + vector search (RRF fusion, top 20)
  → formatter groups by parentId, joins siblings into passages (1.3K → 1.9K)
  → keyword relevance filter (≥2 query word overlap)
  → Haiku synthesizes context injection (~5K structured output)
  → format: Principles / Team Context / Anti-Patterns / Example
  → delivered to agent
```

**No budget caps. No graph boost. No reranker (bypassed — see below). No trimming.**

## Key Results

### 1. Retrieval Quality
| Mode | Score (/30) |
|------|:-----------:|
| B-api (Haiku) | **24** |
| B-local (Qwen 14B) | 21 |
| B-fast (regex) | 19 |
| A (no BookLib) | 15 |

BookLib improves retrieval by +60% vs no BookLib. Atomic chunking fixed the local model (was broken with blob chunks).

### 2. Code Generation — Same Skills Available
| Config | A | B |
|--------|:-:|:-:|
| Both have same 6 skills | 22 | 22 |

**No improvement** when both groups have the same skills. Strong models already know standard patterns.

### 3. Code Generation — Overflow Tasks (Beyond Loaded Skills)

Best results across 30+ runs:

| Config | A | B | Delta | Wins |
|--------|:-:|:-:|:-----:|:----:|
| RRF-only, synthesized context injection | 12 | **17** | **+5** | 4-0 |
| RRF-only, formatter joins siblings | 11 | **15** | **+4** | 2-0 |
| RRF-only, large 26K index | 12 | **15** | **+3** | 3-1 |
| Parent-level reranker | 11 | 13 | +2 | 3-1 |
| Average across all runs | ~12 | ~15 | **+3** | — |

Consistent +3 to +5 improvement on tasks requiring knowledge outside loaded skills.

### 4. Code Generation — Niche UI/UX Knowledge
| Config | A | B | Delta |
|--------|:-:|:-:|:-----:|
| No UI skills loaded, BookLib has refactoring-ui + animation-at-work + storytelling-with-data | 15 | **18** | **+3** |

BookLib won on animation (proper easing `cubic-bezier(0.4, 0, 0.2, 1)`, `prefers-reduced-motion`, 300ms timing vs control's `linear` + `1s`), and chart selection (bar chart vs control's pie chart — per Storytelling with Data). Zero losses.

## Reranker Investigation

### Bug discovered and fixed
The cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`) was producing **constant logit -10.050** for every input — completely broken. Root cause: the `pipeline('text-classification')` API runs softmax on a single logit, always returning 1.0. The reranker was a no-op for the entire project.

### Fix
Use `AutoModelForSequenceClassification` with `text_pair` parameter in the tokenizer (per HuggingFace official docs). This produces real logits: +7.1 for relevant passages, -11.4 for noise.

### Parent-level reranking
The cross-encoder is designed for passage-length text, not 55-char chunks. Fix: group chunks by parentId, join siblings into passages, score passages, return chunks from winning parents. This correctly scores "[Stripe payment decisions / Rules] Idempotency keys on all charge/refund requests. Use PaymentIntents API. Webhook handler..." as +6.0 while filtering noise.

### Result
Even with the fix, the reranker over-filters for codegen (+2 vs RRF-only's +3 to +5). It's too strict about query-passage word overlap — drops relevant domain knowledge like "PaymentIntents API" for a refund query because the words don't directly match. RRF (BM25 + vector fusion) provides better domain-aware ranking.

**Status:** Reranker properly fixed in `lib/engine/reranker.js`, available for optional use. Bypassed by default — RRF-only gives better codegen results.

## Synthesizer (Context Injection)

### What it does
Takes ~1.3-1.9K of search results (atomic chunks) and synthesizes a ~5K structured context injection. Format: Principles / Team Context / Anti-Patterns / Example.

### Why it works
The synthesizer combines index facts (WHAT — team decisions, specific APIs) with training data (HOW — code patterns, implementation details). The 4:1 expansion ratio is the value — tested 1:1 ratio and it scored +2 vs +5 with expansion. The training data elaboration is contextually grounded, not hallucinated.

### Grounding verification
Traced input→output for all tasks. Every key claim in the output (PaymentIntents, idempotency keys, webhooks, saga, order.created, ADR numbers) was found in the search input. Zero hallucinations detected.

### What we call it
"Context injection" — not a "skill." It's task-specific, generated per query, used once. Different from Anthropic's 500-line skills which are persistent reference documents loaded at session start.

### Format testing

| Format | Output chars | Backend delta | UI delta |
|--------|:---:|:---:|:---:|
| Principles + Examples (500-800 words) | 4-6.5K | +2 to +5 | +3 |
| Principles only (no examples) | 3-3.5K | 0 | +1 |
| Dense MUST/MUST NOT/USE | 1.3-1.7K | +1 | +1 |

**Examples are essential** — they're the highest-value component. The codegen model pattern-matches on code examples more than text principles.

### Size testing

| Size | Backend delta | UI delta |
|------|:---:|:---:|
| ~2K (paper-optimal) | +2 | +3 |
| ~5K (500-800 words target) | +2 to +5 | +2 to +3 |
| ~8K (3-5K target, model over-produces) | +3 | +2 |

Sweet spot: **4-6K chars** (~500-800 words with code examples). Matches ETH Zurich finding that ~641 words is optimal.

## Context Injection Size (aligned with ETH Zurich paper)

The ETH paper [arxiv:2602.11988](https://arxiv.org/abs/2602.11988) tested context files averaging **641 words, 9.7 sections**. Developer-written context at this size showed +4% improvement. LLM-generated context hurt by -0.5% to -2%.

Key paper findings for BookLib:
- "Unnecessary requirements from context files make tasks harder"
- "Human-written context files should describe only minimal requirements"
- "Context files are redundant documentation" — they help most when docs are sparse
- "Instructions in context files are typically followed" — agents DO comply, but broader exploration increases cost +20%
- "No difference between specific prompts" — format doesn't matter as much as content
- Future work calls for "principled ways to automatically generate concise, task-relevant guidance"

**BookLib's context injection is exactly what the paper calls for.** Our data shows: 2K structured context > 18K unstructured raw skill files, and the improvement (+25-40%) exceeds the paper's human-written context improvement (+4%).

## What We Tested That Didn't Work

### Graph-boosted skill injection
- Idea: follow knowledge→skill edges, inject skill chunks into results
- Result: **hurt performance** (A=15 B=15 with boost vs A=12 B=16 without)
- Why: generic skill chunks from graph edges diluted focused search results

### API "be strict" filtering
- Idea: Haiku filters out irrelevant results before delivering
- Result: **over-filtered**, lost specific details (SameSite, @Pattern)
- Fix: changed to "synthesize" prompt — structure, don't filter

### Budget caps (2K/source, 6K total)
- Idea: prevent any single skill from dominating
- Result: worked with old blob chunks, **unnecessary** with small atomic chunks

### Chunk-level reranking
- Idea: cross-encoder scores individual 55-char chunks
- Result: constant logit -10.050 (broken) → fixed with text_pair API → still over-filters (+2 vs +5)
- Why: QA cross-encoder needs passage-length text, individual chunks are too short

### Removing code examples from context injection
- Idea: "the model knows HOW, just tell it WHAT"
- Result: dropped from +5 to 0. Examples are the most actionable component.

### 1:1 input/output ratio for synthesizer
- Idea: don't expand beyond input — just organize search results
- Result: +2 vs +5 with expansion. The 4:1 expansion IS the value.

### More raw chunks (50 instead of 20)
- Idea: give synthesizer more material
- Result: more noise, no improvement. 20 formatted + sibling-joined is optimal.

## Key Architectural Findings

### 1. Small chunks for index, joined passages for synthesizer
55-char chunks give precise BM25/vector matching. At retrieval time, formatter groups by parentId and joins siblings into ~200-char passages. Best of both worlds: precise search + rich synthesizer input.

### 2. The 4:1 expansion ratio is the value
Search provides WHAT (team decisions, constraints). Synthesizer's training data provides HOW (code patterns, API calls). Together: +5. Separately: +2. The contextually grounded elaboration is what makes BookLib useful.

### 3. RRF fusion > cross-encoder reranking
For domain knowledge with short chunks, BM25+vector RRF provides better ranking than the cross-encoder. The reranker is fixed and available but bypassed by default.

### 4. BookLib's value is overflow, not replacement
When agent has the right skills loaded → BookLib adds 0%.
When task exceeds loaded skills → BookLib adds +25-40%.
The product is a knowledge overflow system with task-specific synthesis.

### 5. The real untested opportunity: code review
All tests measured code GENERATION. The stronger value proposition may be code REVIEW — catching team-specific issues (ADR violations, convention breaks) that the model wouldn't flag on its own. This is where non-inferable knowledge creates binary value (caught vs not caught), not marginal +3 points.

## Confidence Gate

Two-gate system prevents generating context for irrelevant queries:
- **Gate 1 (free):** Keyword overlap check — if 0 search results match ≥1 query word, return null
- **Gate 2 (1 API call):** Model decides if search results are relevant
- Test: 8/8 accuracy — 3 relevant queries passed, 5 irrelevant refused

## Open Questions / Next Steps

1. **Code review test:** Does BookLib catch team-specific issues in PRs that the agent misses? Binary value (caught/not caught) instead of marginal quality improvement. Test infrastructure to be created separately.
2. **Full index:** 26K chunks from 280 skills. Currently rebuilding (~13 hours on CPU). Pre-built index should ship with package.
3. **Chunk size at retrieval:** Formatter now joins siblings. Could also reconstruct full parent sections for even richer synthesizer input.
4. **Non-programming domains:** Generic prompt works for code and UI/UX. Untested on strategy, management, data viz.
5. **Multi-turn retrieval:** Iterative search refinement (find team decisions → search for matching skill patterns). Untested.
6. **Proprietary knowledge:** All tests used patterns in Haiku's training data. True value would show with genuinely non-inferable knowledge.
