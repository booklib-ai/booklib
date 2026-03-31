# Spec: Reranker Score Normalization
*Date: 2026-03-31 | Status: Draft*

## Problem

The cross-encoder reranker (`Xenova/ms-marco-MiniLM-L-6-v2`) returns sigmoid scores that saturate near 1.0 for any reasonably matching query+passage pair. In the wizard, ALL recommendations show `[100% match]`, providing no useful differentiation.

## Root Cause

The ms-marco model outputs logits that are passed through sigmoid. For passages that match the query at all, the sigmoid output is >0.99. This is expected behavior for the model — it's designed for binary relevance classification, not fine-grained ranking.

## Solution

Display **rank-based scores** instead of raw reranker scores in user-facing contexts.

### Option: Reciprocal Rank Display

After reranking, assign display scores based on position:

```js
function rankBasedScores(results) {
  return results.map((r, i) => ({
    ...r,
    displayScore: 1 / (i + 1),  // 1st: 100%, 2nd: 50%, 3rd: 33%, etc.
  }));
}
```

This gives: `[100%, 50%, 33%, 25%, 20%, 17%, 14%, 13%, 11%, 10%]` for top 10.

### Where Display Scores Are Used

1. **Wizard skill recommendations** — `stepRecommendAndInstall()` shows `[N% match]`
2. **`booklib search` CLI output** — the bar visualization `████`, `███░`, etc.
3. **Relevance audit** — `runRelevanceAudit()` shows `N% match`

### Where Raw Scores Are Kept

- Internal search pipeline (RRF fusion, minScore filtering)
- The `score` field on search results is unchanged
- Only `displayScore` is added for UI purposes

## Implementation

Add `displayScore` field to search results in `BookLibSearcher.search()`:

```js
const results = reranked.filter(r => r.score >= minScore).slice(0, limit);
return results.map((r, i) => ({ ...r, displayScore: 1 / (i + 1) }));
```

The wizard and CLI use `r.displayScore ?? r.score` for display.

## Files Changed

- Modify: `lib/engine/searcher.js` — add `displayScore` to results
- Modify: `lib/wizard/index.js` — use `displayScore` for `[N% match]`
- Modify: `bin/booklib.js` — use `displayScore` in search output bar
- Create: `tests/engine/score-display.test.js`

Does **not** touch: RRF, BM25, reranker internals, query expander.

## No Dependencies

Can be implemented independently of all other specs.
