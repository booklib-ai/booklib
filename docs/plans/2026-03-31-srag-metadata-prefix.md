# SRAG Metadata Prefix Embeddings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepend structured metadata tags (`[skill:X] [type:Y] [tags:Z]`) to each chunk's text before generating vector embeddings, encoding domain separation directly into the vector space to reduce cross-skill noise in search results.

**Architecture:** A pure function `buildMetadataPrefix(metadata)` constructs a prefix string from chunk metadata. The indexer calls it before `getEmbedding()` so the vector captures domain context. BM25 and stored `text` remain unprefixed — only the vector space changes. The searcher is NOT modified; queries are not prefixed (per SRAG design).

**Tech Stack:** Node.js ESM, `node --test`, `@huggingface/transformers`, vectra.

**Key design decisions:**
- Prefix applied to **vector embeddings only**, not BM25 or stored text
- Query text is **not prefixed** — the SRAG approach encodes context into document vectors, not queries
- `buildMetadataPrefix` is a pure exported function for testability
- Knowledge nodes also get prefixed (using their `type`, `title`, and `tags` fields)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/engine/indexer.js` | Modify | Add `buildMetadataPrefix()`, use in `getEmbedding()` calls |
| `tests/engine/srag-prefix.test.js` | Create | Tests for `buildMetadataPrefix()` + prefixed indexing integration |

---

## Task 1: `buildMetadataPrefix` function + prefixed embedding in indexer

**Files:**
- Modify: `lib/engine/indexer.js`
- Create: `tests/engine/srag-prefix.test.js`

- [ ] **Step 1: Write failing tests for `buildMetadataPrefix`**

Create `tests/engine/srag-prefix.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { buildMetadataPrefix } from '../../lib/engine/indexer.js';

describe('buildMetadataPrefix', () => {
  test('returns prefix with skill name, type, and tags', () => {
    const prefix = buildMetadataPrefix({
      name: 'effective-kotlin',
      type: 'anti_patterns',
      tags: ['kotlin', 'jvm'],
    });
    assert.strictEqual(prefix, '[skill:effective-kotlin] [type:anti_patterns] [tags:kotlin,jvm] ');
  });

  test('returns prefix with name only when type and tags are missing', () => {
    const prefix = buildMetadataPrefix({ name: 'clean-code-reviewer' });
    assert.strictEqual(prefix, '[skill:clean-code-reviewer] ');
  });

  test('returns empty string when metadata has no relevant fields', () => {
    const prefix = buildMetadataPrefix({ filePath: 'some/path.md' });
    assert.strictEqual(prefix, '');
  });

  test('omits tags bracket when tags array is empty', () => {
    const prefix = buildMetadataPrefix({ name: 'effective-java', type: 'summary', tags: [] });
    assert.strictEqual(prefix, '[skill:effective-java] [type:summary] ');
  });

  test('handles knowledge node metadata (title instead of name)', () => {
    const prefix = buildMetadataPrefix({
      title: 'Null Object Pattern',
      type: 'insight',
      tags: ['kotlin', 'patterns'],
    });
    assert.strictEqual(prefix, '[skill:Null Object Pattern] [type:insight] [tags:kotlin,patterns] ');
  });

  test('prefers name over title when both present', () => {
    const prefix = buildMetadataPrefix({
      name: 'effective-kotlin',
      title: 'Some Title',
      type: 'summary',
    });
    assert.strictEqual(prefix, '[skill:effective-kotlin] [type:summary] ');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `node --test tests/engine/srag-prefix.test.js`
Expected: FAIL — `buildMetadataPrefix is not a function` or not exported

- [ ] **Step 3: Implement `buildMetadataPrefix` in `lib/engine/indexer.js`**

Add this exported function at the top of `lib/engine/indexer.js`, after the imports and before the class:

```js
/**
 * Builds a structured metadata prefix for SRAG-style embeddings.
 * Prepended to chunk text before vector embedding so the model encodes domain context.
 * @param {object} metadata - Chunk metadata (name/title, type, tags).
 * @returns {string} Prefix string like "[skill:X] [type:Y] [tags:a,b] " or "".
 */
export function buildMetadataPrefix(metadata) {
  const parts = [];
  const label = metadata.name ?? metadata.title;
  if (label) parts.push(`[skill:${label}]`);
  if (metadata.type) parts.push(`[type:${metadata.type}]`);
  if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
    parts.push(`[tags:${metadata.tags.join(',')}]`);
  }
  return parts.length > 0 ? parts.join(' ') + ' ' : '';
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test tests/engine/srag-prefix.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine/indexer.js tests/engine/srag-prefix.test.js
git commit -m "feat: add buildMetadataPrefix for SRAG-style embeddings"
```

- [ ] **Step 6: Update `indexDirectory()` to use prefix for embedding**

In `lib/engine/indexer.js`, inside the `indexDirectory()` method, find the embedding loop (around line 109):

```js
      for (const chunk of chunks) {
        const vector = await this.getEmbedding(chunk.text);
```

Change to:

```js
      for (const chunk of chunks) {
        const prefixedText = buildMetadataPrefix(chunk.metadata) + chunk.text;
        const vector = await this.getEmbedding(prefixedText);
```

The rest stays the same — `metadata.text` still stores the raw `chunk.text` (not prefixed).

- [ ] **Step 7: Update `indexNodeFile()` to use prefix for both code paths**

In the `indexNodeFile()` method, find the **fallback path** for empty-body nodes (around line 159):

```js
      const vector = await this.getEmbedding(fallbackText);
```

Change to:

```js
      const prefixedFallback = buildMetadataPrefix(data) + fallbackText;
      const vector = await this.getEmbedding(prefixedFallback);
```

Find the **normal path** for nodes with content (around line 171):

```js
      const vector = await this.getEmbedding(chunk.text);
```

Change to:

```js
      const prefixedText = buildMetadataPrefix(chunk.metadata) + chunk.text;
      const vector = await this.getEmbedding(prefixedText);
```

- [ ] **Step 8: Run existing indexer tests to verify no regressions**

Run: `node --test tests/engine/indexer-bm25.test.js`
Expected: PASS

- [ ] **Step 9: Run hybrid searcher tests to verify search still works**

Run: `node --test tests/engine/hybrid-searcher.test.js`
Expected: 3 tests PASS (results may shift in ranking but tests use `minScore = 0` so all should still return results)

- [ ] **Step 10: Commit**

```bash
git add lib/engine/indexer.js
git commit -m "feat: prepend SRAG metadata prefix to chunk embeddings in indexer"
```
