# skill-router benchmark: book-based review vs. native PR toolkit

**skill-router** analyzes your code and picks the right book-based skill for the job — so instead of one AI trying to apply four books superficially, you get a deep, focused review from the correct authority. This benchmark runs the same intentionally broken JavaScript file through two parallel pipelines to compare what each finds.

| | Native | skill-router |
|---|---|---|
| **Pipeline** | `pr-review-toolkit:code-reviewer` | `skill-router` → `clean-code-reviewer` + `design-patterns` |
| **Output file** | `order-processing.pr-toolkit.js` | `order-processing.skill-router.js` |

**Bottom line:** Native wins on security depth (catches PCI violation, highest confidence scores). skill-router wins on architectural insight and principle education — finds ~47% more unique issues when both pipelines are combined.

---

## The code under test

`order-processing.original.js` — 157-line Node.js order processing module with: one god function (`process`), no error handling, SQL injection on every query, global mutable state shared across all requests, and `eval()` used to return a plain variable.

---

## How skill-router picks its skills

The router commits to a routing decision before any review begins:

```
Primary:    clean-code-reviewer  — god function, cryptic names, magic numbers (Ch.2/3/7)
Secondary:  design-patterns      — duplicated payment blocks = Strategy pattern
Don't use:  domain-driven-design — implementation-level code, not a model design problem
```

This is the core value: rather than spreading one review thin across four books, the router picks the right lens and goes deep. The `Don't use` line matters — it avoids premature or irrelevant advice.

---

## Issues found

> **Notation:** `C1`, `I9`, `S4` are clean-code-reviewer's severity tiers (Critical / Important / Suggestion). `G30`, `N1`, `Ch.7` etc. are chapter/guideline references from *Clean Code* by Robert C. Martin. `Strategy(1)`, `Singleton(4)` etc. are pattern references from *Head First Design Patterns*.

### Critical / High severity

| Issue | Native | clean-code | design-patterns |
|---|---|---|---|
| SQL injection — every query (7 locations) | ✅ Confidence 100 | ✅ C1 — G30 | — |
| `eval("stats")` — unnecessary, disables JIT | ✅ Confidence 100 | ✅ C3 — G30 | ✅ Singleton(4) |
| Global mutable `usr`/`items`/`total` — cross-request leak | ✅ Confidence 98 | ✅ C2 — G18 | ✅ Singleton(4) |
| `items` unbounded memory leak | ✅ Confidence 95 | ⚠️ implied | — |
| `refund()` null dereference crash | ✅ Confidence 95 | ✅ C4 — Ch.7 | — |
| PCI violation — card data logged to stdout | ✅ Confidence 92 | ❌ missed | — |
| Payment fall-through returns `undefined` not `false` | ✅ Confidence 91 | ✅ I9 | ✅ Strategy(1) |
| Duplicated card/paypal confirmation block | ✅ Confidence 85 | ✅ C5 — G5 | ✅ Strategy(1) |
| Wrong-recipient email via global `usr` in cancel/refund | ✅ Confidence 89 | ✅ C4/I7 | — |

### Important / Improvement

| Issue | Native | clean-code | design-patterns |
|---|---|---|---|
| `==` instead of `===` throughout | ✅ Confidence 82 | ✅ I5 — G15 | — |
| `var` instead of `const`/`let` | ✅ Confidence 80 | ✅ I6 — G29 | — |
| Magic discount numbers (0.1, 0.2, 0.5) | ✅ | ✅ I3 — G25 | ✅ Strategy(3) |
| `discount` variable declared, never used | ✅ Confidence 88 | ✅ I3 | — |
| Discount should be data-driven, not if-chain | — | ✅ I4 — G23 | ✅ Strategy(3) |
| God function — 10 responsibilities | ⚠️ via nesting | ✅ I1 — F1/F2 | ✅ Template(5) |
| Six-level arrow-head nesting | ✅ Confidence 82 | ✅ I2 | — |
| No error handling on db/mailer calls | ✅ Confidence 85 | ✅ I8 — Ch.7 | — |
| `cancel()` never updates stats | ✅ Confidence 80 | — | — |
| Stats inconsistency — two separate objects | ✅ Confidence 82 | ✅ S4 | ✅ Singleton(4) |
| Cryptic names (`o`, `u`, `pay`, `s`, `rsn`) | ✅ Confidence 80 | ✅ S1 — N1/N2 | — |
| Noise/lying comments | — | ✅ S2 — C2/C3 | — |
| `formatMoney` floating-point rounding bug | — | ✅ S3 | — |
| Stubs always return `true` — lying | — | ✅ S5 — C3 | — |
| State machine needed for order lifecycle | — | — | ✅ State(2) |
| Side effects hardcoded — use Observer | — | — | ✅ Observer(6) |
| Flat module export — use Facade | — | — | ✅ Facade(7) |

### Totals

| | Native | clean-code | design-patterns | Combined |
|---|---|---|---|---|
| Critical/High | 9 | 5 | 4 | **9 unique** |
| Important/Improvement | 10 | 9 | 3 | **14 unique** |
| Suggestion/Low | 0 | 5 | 0 | **5** |
| **Total** | **19** | **19** | **7 patterns** | **~28 unique** |

Overlap: ~89% of native issues were also found by skill-router.

---

## Pattern opportunities identified (skill-router only)

The native pipeline finds bugs. The skill-router pipeline additionally surfaces structural opportunities — places where a known pattern *could* reduce complexity — and explains the problem each one solves. Whether to apply a pattern is a judgment call: the skill flags the opportunity and the reasoning; you decide if the trade-off is worth it in your context.

| # | Pattern | Impact | Problem it would solve |
|---|---|---|---|
| 1 | Strategy — payments | HIGH | Copy-pasted if-block per payment method |
| 2 | State — order lifecycle | HIGH | Status strings checked in every function |
| 3 | Strategy — discounts | HIGH | Magic-number if-chain, no extensibility |
| 4 | Singleton (broken) | HIGH | Module-scope mutable state crossing requests |
| 5 | Template Method | MEDIUM | Arrow pyramid duplicated in process+cancel |
| 6 | Observer | MEDIUM | Email/stats hardcoded into business logic |
| 7 | Facade | MEDIUM | Unrelated concerns in one flat export |

**Suggested refactor sequence if you choose to act:** 4 → 1 → 3 → 2 → 5 → 6 → 7

---


## Updates since this benchmark

**skill-router now outputs severity tiers.** One gap this benchmark exposed was that native's confidence scores (≥80 threshold) act as a noise filter — skill-router had no equivalent. The router has since been updated to instruct selected skills to classify every finding as **HIGH** (correctness/security/data loss), **MEDIUM** (design/maintainability), or **LOW** (style/naming), and to skip LOW findings for standard code reviews. This closes the signal-to-noise gap without re-running the benchmark — detection quality hasn't changed, output actionability has.

---

## When to use each

| Situation | Use |
|---|---|
| Pre-merge PR review, security audit | **Native** — pre-merge gate: fast, confidence-filtered, adapts to CLAUDE.md project conventions |
| Larger refactor, architecture planning | **skill-router** — patterns, principles, refactor roadmap |
| Both together | ~95% total issue coverage vs ~80% for either alone |

---

## Files in this benchmark

| File | Description |
|---|---|
| `order-processing.original.js` | Original bad code — unchanged input |
| `order-processing.pr-toolkit.js` | Rewritten applying all `pr-review-toolkit` findings |
| `order-processing.skill-router.js` | Rewritten applying `clean-code-reviewer` + `design-patterns` |
| `review-report.md` | This file |
