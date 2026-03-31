# Spec: Recommendation Explanations
*Date: 2026-03-31 | Status: Draft*

## Problem

The wizard shows skills with a percentage score but no explanation of WHY they were recommended. "springboot-security [100% match]" doesn't tell the user what matched or why it's relevant. Users can't make informed selection decisions.

## Solution

Each recommendation includes a one-line explanation derived from the search results. The search engine returns chunks with metadata — we use the top-matching chunk's context to explain the match.

## Output Format

```
► Top skills for your project:

  1. springboot-security         [92%]
     matched: "spring boot" in your stack → auth patterns, CSRF protection

  2. bulletproof-react-structure  [87%]
     matched: "react" in your stack → feature folders, separation of concerns

  3. effective-java              [71%]
     matched: "java" in your stack → generics, builder pattern, immutability
```

## Implementation

When aggregating search results by skill name in `stepRecommendAndInstall()`, capture the top chunk's text (first 80 chars) as the explanation:

```js
const bySkill = new Map();
for (const r of results) {
  const name = r.metadata?.name;
  if (!name) continue;
  if (!bySkill.has(name) || r.score > bySkill.get(name).score) {
    const snippet = r.text?.slice(0, 80)?.replace(/\n/g, ' ') ?? '';
    bySkill.set(name, { name, score: r.score, snippet, description: r.metadata?.description });
  }
}
```

Display: `matched: "${queryTermThatHit}" → ${snippet}`

The query term that hit can be inferred from the skill's tags matching the user's project languages.

## Files Changed

- Modify: `lib/wizard/index.js` — capture snippet in recommendation step, display in choices

## No Dependencies

Can be implemented independently. Benefits from **Spec: Score Normalization** (so scores aren't all 100%).
