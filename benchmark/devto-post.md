# How I Route AI Agents to the Right Code Review Context

You gave Claude Code a Clean Code checklist. It reviewed your order processing service and told you to rename `proc` to `processOrder` and split a 22-line function into three.

Meanwhile, the actual problem — your aggregate boundary is wrong and you're leaking domain logic into the API layer — went completely unnoticed.

This isn't an AI failure. It's a routing failure. The agent applied the wrong lens.

## The Problem: Context Collapse

If you give an AI agent a broad set of review instructions, two things happen:

**Token waste** — the agent reads through hundreds of lines of principles that don't apply to the file at hand.

**Wrong focus** — a Clean Code reviewer will nitpick naming on a file where the real issue is a broken domain model. A DDD reviewer will talk about bounded contexts on a utility function that just needs cleaner variable names.

This is what one Hacker News commenter called context collapse: "Clean Code was written for Java in 2008. DDIA is about distributed systems at scale. If you apply the Clean Code reviewer to a 50-line Python script, you'll get pedantic nonsense about function length when the actual problem might be that the data model is wrong."

The criticism is valid. The fix isn't to abandon structured review — it's to pick the right structure for the file in front of you.

## The Approach: A Router That Picks the Reviewer

I've been building a collection of "skills" — structured instruction sets distilled from classic software engineering books (Clean Code, DDIA, Effective Java, DDD, etc.). Each one is a focused lens that an AI agent uses during code review or code generation.

The key piece is a `skill-router`: a meta-skill that runs before any review happens. It inspects:

- File type and language — Kotlin? Python? Infrastructure config?
- Domain signals — is this a service layer? A repository? A controller?
- Work type — code review, refactoring, greenfield design, or bug fix?

Based on that, it selects the 1–2 most relevant skills and explicitly skips the rest.

## Example in Practice

User: "Review my order processing service"

```
Router decision:
  ✅ Primary:   domain-driven-design    — domain model design (Aggregates, Value Objects)
  ✅ Secondary: microservices-patterns  — service boundaries and inter-service communication
  ⛔ Skip:      clean-code-reviewer     — premature at design stage; apply later on implementation code
```

The router doesn't just pick — it explains why it skipped alternatives. That rationale is important: it makes the selection auditable, and you can override it if you disagree.

## Why Not Just Use One Giant Prompt?

You could stuff everything into one system prompt. I tried. Here's what happens:

**Attention dilution** — the model tries to apply everything at once and produces shallow, generic feedback.

**Conflicting advice** — Clean Code says "extract small functions." Some microservices patterns say "prefer cohesive, slightly larger functions over deep call stacks." The model hedges between both.

**Token budget** — if you're working in Claude Code or Cursor, every token of instructions competes with your actual code context.

Routing means the agent reads ~200 focused lines of instructions instead of ~2000 unfocused ones.

## The Alternative Criticism: "LLMs Already Know These Books"

This is the most common pushback I get. And it's partially true — LLMs have read Clean Code. But they apply that knowledge inconsistently and at low confidence.

Giving the model an explicit lens — "review this against Clean Code heuristics C1–C36" — concentrates attention and dramatically reduces hallucinated or off-topic feedback. It's the difference between asking someone "what do you think?" vs. "evaluate this against these specific criteria."

Think of it like unit tests: the runtime can execute your code correctly without them. But tests make correctness explicit, repeatable, and auditable. Skills do the same for AI review.

## How the Routing Actually Works

The router skill is a structured prompt with a decision tree:

1. Parse the request — what file(s), what task
2. Match against skill metadata — each skill declares its applicable languages, domains, and work types
3. Rank by relevance — primary (strongest match) and secondary (complementary perspective)
4. Conflict resolution — if two skills would give contradictory advice, prefer the one matching the higher abstraction level of the task
5. Return selection with rationale

There's no ML model or embedding search involved. It's structured prompting — the LLM acts as the routing engine using routing rules baked into the router's own instructions. Language signals, domain signals, and conflict resolution are all declared explicitly inside the router skill, not inferred at runtime. The trade-off: it's fast and predictable, but adding a new skill requires updating the router manually.

## Levels of Review (a Pattern Worth Stealing)

One of the most useful ideas that came from community feedback: separate your review into levels of critique:

1. A fast "lint" pass — formatting, obvious bugs, missing tests
2. A domain pass — does the code correctly model the business logic?
3. A "counterexample" pass — propose at least one concrete failing scenario and how to reproduce it

The skill library maps roughly to these levels — Clean Code for level 1, DDD for level 2 — but you have to invoke them separately with the right framing. The router picks based on what the code *is*, not which level you're at. Explicit level-based routing isn't built yet. The counterexample pass is harder and something I'm still figuring out.

## Try It Yourself

The skills and the router are open source: [github.com/booklib-ai/booklib](https://github.com/booklib-ai/booklib)

You can use them with Claude Code, Cursor, or any agent that supports SKILL.md files. The quickest way to try it — install everything and let the router decide:

```bash
npx booklib add --all
```

Or globally, so it's available in every project:

```bash
npx booklib add --all --global
```

Then just ask your agent to review a file — the router picks the right skill automatically. You don't need to know the library upfront.

## Benchmark: Routed Skills vs. Native Review

Theory is nice. Does it actually find more issues?

I took a deliberately terrible 157-line Node.js order processing module — god function, SQL injection on every query, global mutable state, `eval()` for no reason — and ran it through two pipelines in parallel:

- **Native:** Claude's built-in `pr-review-toolkit:code-reviewer`
- **skill-router:** `skill-router` → `clean-code-reviewer` + `design-patterns`

### What the router chose

```
Primary:    clean-code-reviewer  — god function, cryptic names, magic numbers
Secondary:  design-patterns      — duplicated payment blocks → Strategy pattern
Skipped:    domain-driven-design — implementation level, not model design stage
```

### Issue detection

|  | Native | skill-router |
|---|---|---|
| Critical/High issues | 7 | 8 |
| Important/Improvement | 10 | 14 |
| Suggestions | 0 | 5 |
| **Total unique issues** | **19** | **~28** |

~89% of what Claude's native reviewer found, skill-router also found. But skill-router found ~9 additional issues that the native reviewer missed entirely.

A few that stood out:

> **`formatMoney` has a floating-point rounding bug** — `0.1 + 0.2` arithmetic, not `Math.round`. Native didn't flag it; clean-code-reviewer caught it via the G-series heuristics.

> **The stubs always return `true`** — they're lying to callers. Native missed it; clean-code-reviewer flagged it as a lying comment / false contract.

> **skill-router surfaced 7 pattern opportunities** — places where a known pattern could reduce complexity (Strategy for payments, State for order lifecycle, Singleton for the broken global state). It explains the problem each one solves and suggests a fix sequence, but leaves the decision to you. Native produced no architectural guidance at all.

### Where each approach wins

| Situation | Use |
|---|---|
| Pre-merge PR review, security audit | **Native** — pre-merge gate: fast, confidence-filtered, adapts to your CLAUDE.md project conventions |
| Larger refactor, architecture planning | **skill-router** — patterns, principles, refactor roadmap |
| Both together | ~95% total issue coverage vs. ~80% for either alone |

**One honest loss for skill-router:** Card data was being logged to stdout — a clear PCI violation. Claude's built-in reviewer flagged it at 92% confidence. skill-router didn't. Security compliance isn't in any book-based skill's scope, and the router has no way to know it should care. If compliance is the priority, the native reviewer is the right tool.

After looking closely at how both tools are built, the difference in purpose becomes clear.

The native reviewer runs **6 parallel sub-agents**, each focused on one category: code quality, silent failures, type design, test coverage, comment accuracy, and security. It defaults to reviewing only the current `git diff` — not the whole file. Before starting, it reads your `CLAUDE.md` to pick up project conventions. And it discards any finding below 80% confidence, so output arrives pre-filtered. That's a purpose-built pre-merge gate: narrow scope, parallel specialists, high signal-to-noise.

skill-router does the opposite: one agent, one deeply focused skill, applied to the whole module. It trades breadth and speed for depth and principle grounding.

They target different moments in the development lifecycle, which is why using both gives ~95% coverage.

One gap this benchmark exposed was the noise filtering: Claude's native reviewer discards anything below 80% confidence; skill-router had no equivalent. Since writing this, the router has been updated to instruct selected skills to classify every finding as HIGH / MEDIUM / LOW and skip LOW-tier findings on standard reviews — same idea, book-grounded framing instead of a confidence score.

The full before/after code and comparison report are in the repo under [`/benchmark/`](https://github.com/booklib-ai/booklib/tree/main/benchmark).

## Open Questions

I don't have everything figured out. A few things I'm still exploring:

**Sub-agent architecture** — the native pr-review-toolkit runs 6 parallel sub-agents (tests, types, silent failures, comments, etc.), each a focused specialist. skill-router takes the opposite approach: one agent, one focused skill, narrow scope. Both work, but for different reasons. The open question is whether a *generate-then-evaluate* loop — one agent produces code using a skill's patterns, a second agent checks it against the same skill's rubric — would catch more issues than a single-pass review. My current answer is no for code review, maybe for code generation. If you've tried this pattern, I'd like to know what you found.

**Feedback loops** — the benchmark above is one data point. How do you systematically measure whether routing improves review quality across different codebases and languages?

**Domain-specific routing** — healthcare code, fintech code, and game code each have very different "what matters most" priorities. Should routing consider the project domain, not just the file?

If you've been working on similar problems — structured AI review, skill selection, multi-agent evaluation — I'd love to hear what's working for you.

---

*Currently covering: Clean Code, Domain-Driven Design, Effective Java, Effective Kotlin, Microservices Patterns, System Design Interview, Storytelling with Data, and more. Skills are community-contributed and new books are welcome.*
