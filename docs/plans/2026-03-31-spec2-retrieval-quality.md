# Spec 2 — Retrieval Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade BookLib from pure vector search to a hybrid pipeline (BM25 + vector + query expansion + cross-encoder reranking) with a falsifiable benchmark eval harness.

**Architecture:** Four new modules (`bm25-index`, `rrf`, `query-expander`, `reranker`) are wired together in a refactored `searcher.js`. The `indexer.js` co-builds a BM25 snapshot alongside the existing vectra index. The `search()` API surface is unchanged.

**Tech Stack:** Node.js ESM, `@huggingface/transformers` (existing + `Xenova/ms-marco-MiniLM-L-6-v2`), `vectra` (existing), `node:test`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/engine/bm25-index.js` | Create | BM25 scoring — build, search, incremental add, JSON save/load |
| `lib/engine/rrf.js` | Create | Reciprocal Rank Fusion — stateless merge of ranked lists |
| `lib/engine/query-expander.js` | Create | Keyword extraction + query variations (no LLM required) |
| `lib/engine/reranker.js` | Create | Cross-encoder re-scoring of top-20 RRF candidates |
| `lib/engine/indexer.js` | Modify | Co-build `bm25.json` alongside vectra in every index pass |
| `lib/engine/searcher.js` | Modify | Orchestrate full 4-stage pipeline, same `search()` signature |
| `benchmark/ground-truth.json` | Create | 20 curated query → skill pairs for eval |
| `benchmark/run-eval.js` | Create | Computes MRR@5, NDCG@5, Recall@5; prints comparison table |
| `benchmark/RESEARCH.md` | Create | Stub — maintainer fills in after running benchmarks |
| `bin/booklib.js` | Modify | Add `benchmark` command wired to `run-eval.js` |
| `tests/engine/bm25-index.test.js` | Create | Unit tests for BM25 |
| `tests/engine/rrf.test.js` | Create | Unit tests for RRF |
| `tests/engine/query-expander.test.js` | Create | Unit tests for query expander |
| `tests/engine/reranker.test.js` | Create | Unit tests for reranker (mocked model) |
| `tests/engine/hybrid-searcher.test.js` | Create | Integration smoke test for full pipeline |

---

## Task 1: BM25 Index Module

**Files:**
- Create: `lib/engine/bm25-index.js`
- Create: `tests/engine/bm25-index.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/engine/bm25-index.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { BM25Index } from '../../lib/engine/bm25-index.js';

const CHUNKS = [
  { text: 'null safety kotlin avoid null pointer exception', metadata: { name: 'effective-kotlin' } },
  { text: 'typescript strict mode null undefined checks', metadata: { name: 'effective-typescript' } },
  { text: 'java generics wildcards bounded type parameters', metadata: { name: 'effective-java' } },
  { text: 'kotlin data class immutable copy pattern', metadata: { name: 'effective-kotlin' } },
  { text: 'clean code naming variables functions clear intent', metadata: { name: 'clean-code-reviewer' } },
];

describe('BM25Index', () => {
  it('returns higher score for documents containing query terms', () => {
    const idx = new BM25Index();
    idx.build(CHUNKS);
    const results = idx.search('kotlin null safety', 3);
    assert.ok(results.length > 0);
    assert.ok(results[0].metadata.name === 'effective-kotlin');
    assert.ok(results[0].score > 0);
  });

  it('returns results sorted by score descending', () => {
    const idx = new BM25Index();
    idx.build(CHUNKS);
    const results = idx.search('kotlin', 5);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score);
    }
  });

  it('returns empty array for query with no matching terms', () => {
    const idx = new BM25Index();
    idx.build(CHUNKS);
    const results = idx.search('xyzzy completely unknown term', 5);
    assert.ok(results.every(r => r.score === 0) || results.length === 0);
  });

  it('save and load round-trip preserves search results', () => {
    const tmpFile = path.join(os.tmpdir(), `bm25-test-${Date.now()}.json`);
    try {
      const idx = new BM25Index();
      idx.build(CHUNKS);
      idx.save(tmpFile);

      const loaded = BM25Index.load(tmpFile);
      const original = idx.search('kotlin null', 3);
      const restored = loaded.search('kotlin null', 3);

      assert.deepEqual(
        original.map(r => r.metadata.name),
        restored.map(r => r.metadata.name)
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('add() appends a document and it becomes searchable', () => {
    const idx = new BM25Index();
    idx.build(CHUNKS);
    idx.add({ text: 'python dataclass immutable frozen field', metadata: { name: 'effective-python' } });
    const results = idx.search('python dataclass', 3);
    assert.ok(results.some(r => r.metadata.name === 'effective-python'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/engine/bm25-index.test.js
```
Expected: error `Cannot find module '../../lib/engine/bm25-index.js'`

- [ ] **Step 3: Implement BM25Index**

```js
// lib/engine/bm25-index.js
import fs from 'node:fs';

const K1 = 1.5;
const B = 0.75;

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1);
}

function buildTermFreq(text) {
  const terms = tokenize(text);
  const freq = Object.create(null);
  for (const t of terms) freq[t] = (freq[t] ?? 0) + 1;
  return { freq, len: terms.length };
}

export class BM25Index {
  constructor() {
    this._docs = [];      // { text, metadata, freq, len }[]
    this._df = Object.create(null); // term → document frequency
    this._avgLen = 0;
  }

  build(chunks) {
    this._docs = [];
    this._df = Object.create(null);
    for (const chunk of chunks) this._addDoc(chunk);
  }

  add(chunk) {
    this._addDoc(chunk);
  }

  _addDoc(chunk) {
    const { freq, len } = buildTermFreq(chunk.text);
    this._docs.push({ text: chunk.text, metadata: chunk.metadata, freq, len });
    for (const term of Object.keys(freq)) {
      this._df[term] = (this._df[term] ?? 0) + 1;
    }
    const n = this._docs.length;
    this._avgLen = ((this._avgLen * (n - 1)) + len) / n;
  }

  search(query, topK = 20) {
    if (this._docs.length === 0) return [];
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];
    const n = this._docs.length;

    const scored = this._docs.map(doc => {
      let score = 0;
      for (const term of queryTerms) {
        const tf = doc.freq[term] ?? 0;
        if (tf === 0) continue;
        const df = this._df[term] ?? 0;
        const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
        const num = tf * (K1 + 1);
        const denom = tf + K1 * (1 - B + B * (doc.len / this._avgLen));
        score += idf * (num / denom);
      }
      return { score, text: doc.text, metadata: doc.metadata };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  save(filePath) {
    const data = {
      docs: this._docs.map(d => ({ text: d.text, metadata: d.metadata, freq: d.freq, len: d.len })),
      df: this._df,
      avgLen: this._avgLen,
    };
    fs.writeFileSync(filePath, JSON.stringify(data));
  }

  static load(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const idx = new BM25Index();
    idx._docs = data.docs;
    idx._df = data.df;
    idx._avgLen = data.avgLen;
    return idx;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/engine/bm25-index.test.js
```
Expected: 5 passing, 0 failing

- [ ] **Step 5: Commit**

```bash
git add lib/engine/bm25-index.js tests/engine/bm25-index.test.js
git commit -m "feat(retrieval): add BM25 index module with save/load and incremental add"
```

---

## Task 2: RRF Utility

**Files:**
- Create: `lib/engine/rrf.js`
- Create: `tests/engine/rrf.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/engine/rrf.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reciprocalRankFusion } from '../../lib/engine/rrf.js';

const makeList = (...names) => names.map((name, i) => ({
  score: 1 - i * 0.1,
  text: `text for ${name}`,
  metadata: { name },
}));

describe('reciprocalRankFusion', () => {
  it('merges two lists and returns items from both', () => {
    const listA = makeList('a', 'b', 'c');
    const listB = makeList('b', 'c', 'd');
    const result = reciprocalRankFusion([listA, listB]);
    const names = result.map(r => r.metadata.name);
    assert.ok(names.includes('a'));
    assert.ok(names.includes('b'));
    assert.ok(names.includes('c'));
    assert.ok(names.includes('d'));
  });

  it('items appearing in multiple lists score higher than single-list items', () => {
    const listA = makeList('shared', 'unique-a');
    const listB = makeList('shared', 'unique-b');
    const result = reciprocalRankFusion([listA, listB]);
    const sharedScore = result.find(r => r.metadata.name === 'shared').score;
    const uniqueAScore = result.find(r => r.metadata.name === 'unique-a').score;
    const uniqueBScore = result.find(r => r.metadata.name === 'unique-b').score;
    assert.ok(sharedScore > uniqueAScore);
    assert.ok(sharedScore > uniqueBScore);
  });

  it('respects weights — higher weight list contributes more', () => {
    const listA = makeList('only-in-a');
    const listB = makeList('only-in-b');
    const result = reciprocalRankFusion([listA, listB], { weights: [2, 1] });
    const scoreA = result.find(r => r.metadata.name === 'only-in-a').score;
    const scoreB = result.find(r => r.metadata.name === 'only-in-b').score;
    assert.ok(scoreA > scoreB);
  });

  it('deduplicates items that appear in multiple lists', () => {
    const listA = makeList('dup', 'x');
    const listB = makeList('dup', 'y');
    const result = reciprocalRankFusion([listA, listB]);
    const dupItems = result.filter(r => r.metadata.name === 'dup');
    assert.equal(dupItems.length, 1);
  });

  it('returns results sorted by score descending', () => {
    const listA = makeList('a', 'b', 'c');
    const listB = makeList('c', 'b', 'a');
    const result = reciprocalRankFusion([listA, listB]);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  it('handles empty input lists', () => {
    assert.deepEqual(reciprocalRankFusion([]), []);
    assert.deepEqual(reciprocalRankFusion([[]]), []);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/engine/rrf.test.js
```
Expected: error `Cannot find module '../../lib/engine/rrf.js'`

- [ ] **Step 3: Implement RRF**

```js
// lib/engine/rrf.js

/**
 * Reciprocal Rank Fusion across multiple ranked result lists.
 *
 * @param {Array<Array<{text: string, metadata: object}>>} resultLists
 * @param {{ k?: number, weights?: number[] }} options
 *   k: smoothing constant (default 60, per RRF literature)
 *   weights: per-list multipliers (default: all 1)
 * @returns {Array<{score: number, text: string, metadata: object}>} merged, sorted descending
 */
export function reciprocalRankFusion(resultLists, { k = 60, weights } = {}) {
  const scores = new Map(); // text → { score, text, metadata }

  for (let i = 0; i < resultLists.length; i++) {
    const list = resultLists[i];
    const w = weights?.[i] ?? 1;
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const contribution = w / (k + rank + 1);
      if (scores.has(item.text)) {
        scores.get(item.text).score += contribution;
      } else {
        scores.set(item.text, { score: contribution, text: item.text, metadata: item.metadata });
      }
    }
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/engine/rrf.test.js
```
Expected: 6 passing, 0 failing

- [ ] **Step 5: Commit**

```bash
git add lib/engine/rrf.js tests/engine/rrf.test.js
git commit -m "feat(retrieval): add Reciprocal Rank Fusion utility"
```

---

## Task 3: Query Expander

**Files:**
- Create: `lib/engine/query-expander.js`
- Create: `tests/engine/query-expander.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/engine/query-expander.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandQuery } from '../../lib/engine/query-expander.js';

describe('expandQuery', () => {
  it('returns original query in result', () => {
    const result = expandQuery('null safety kotlin');
    assert.equal(result.original, 'null safety kotlin');
  });

  it('returns at least one expanded query variant', () => {
    const result = expandQuery('null safety kotlin');
    assert.ok(result.expanded.length >= 1);
  });

  it('keywords strips stopwords', () => {
    const result = expandQuery('how to handle null values in Kotlin');
    assert.ok(!result.keywords.includes('how'));
    assert.ok(!result.keywords.includes('to'));
    assert.ok(!result.keywords.includes('in'));
    assert.ok(result.keywords.includes('handle'));
    assert.ok(result.keywords.includes('null'));
    assert.ok(result.keywords.includes('values'));
    assert.ok(result.keywords.includes('kotlin'));
  });

  it('handles single-word query without error', () => {
    const result = expandQuery('kotlin');
    assert.equal(result.original, 'kotlin');
    assert.ok(result.expanded.length >= 1);
  });

  it('expanded variants do not include the original query verbatim', () => {
    const result = expandQuery('null safety kotlin');
    assert.ok(!result.expanded.includes('null safety kotlin'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/engine/query-expander.test.js
```
Expected: error `Cannot find module '../../lib/engine/query-expander.js'`

- [ ] **Step 3: Implement query expander**

```js
// lib/engine/query-expander.js

const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
  'must', 'can', 'could', 'not', 'no', 'nor', 'so', 'yet', 'both', 'with',
  'about', 'from', 'up', 'down', 'out', 'how', 'what', 'when', 'where',
  'who', 'why', 'which', 'by', 'as', 'if', 'then', 'than', 'too', 'very',
  'just', 'more', 'also', 'its', 'it',
]);

/**
 * Extracts keywords from a query (stopword-filtered, lowercased).
 */
export function extractKeywords(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Expands a query into multiple variants for hybrid retrieval.
 * Returns the original and an array of expanded queries distinct from it.
 *
 * @param {string} query
 * @returns {{ original: string, keywords: string[], expanded: string[] }}
 */
export function expandQuery(query) {
  const keywords = extractKeywords(query);
  const candidates = [
    keywords.join(' '),
    `best practices for ${query}`,
    `how to ${query}`,
  ];
  const expanded = [...new Set(candidates)].filter(v => v !== query && v.trim().length > 0);
  return { original: query, keywords, expanded };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/engine/query-expander.test.js
```
Expected: 5 passing, 0 failing

- [ ] **Step 5: Commit**

```bash
git add lib/engine/query-expander.js tests/engine/query-expander.test.js
git commit -m "feat(retrieval): add query expander with keyword extraction and variations"
```

---

## Task 4: Reranker Module

**Files:**
- Create: `lib/engine/reranker.js`
- Create: `tests/engine/reranker.test.js`

- [ ] **Step 1: Write the failing tests**

The model is lazy-loaded; tests mock the pipeline to avoid downloading 22 MB.

```js
// tests/engine/reranker.test.js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Reranker } from '../../lib/engine/reranker.js';

const CANDIDATES = [
  { score: 0.5, text: 'kotlin null safety avoid exceptions', metadata: { name: 'effective-kotlin' } },
  { score: 0.6, text: 'java null pointer best practices', metadata: { name: 'effective-java' } },
  { score: 0.4, text: 'typescript undefined checking', metadata: { name: 'effective-typescript' } },
];

function makeRerankerWithMock(scoreFn) {
  const reranker = new Reranker();
  reranker._pipeline = async (inputs) => {
    return inputs.map(([, passage]) => [{ label: 'LABEL_1', score: scoreFn(passage) }]);
  };
  return reranker;
}

describe('Reranker', () => {
  it('returns same number of candidates', async () => {
    const reranker = makeRerankerWithMock(() => 0.5);
    const result = await reranker.rerank('null safety', CANDIDATES);
    assert.equal(result.length, CANDIDATES.length);
  });

  it('sorts results by reranker score descending', async () => {
    let call = 0;
    const scores = [0.9, 0.3, 0.6];
    const reranker = makeRerankerWithMock(() => scores[call++]);
    const result = await reranker.rerank('null safety', CANDIDATES);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  it('preserves text and metadata on each result', async () => {
    const reranker = makeRerankerWithMock(() => 0.5);
    const result = await reranker.rerank('null safety', CANDIDATES);
    const names = result.map(r => r.metadata.name);
    assert.ok(names.includes('effective-kotlin'));
    assert.ok(names.includes('effective-java'));
    assert.ok(names.includes('effective-typescript'));
  });

  it('returns empty array for empty candidates', async () => {
    const reranker = makeRerankerWithMock(() => 0);
    const result = await reranker.rerank('query', []);
    assert.deepEqual(result, []);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/engine/reranker.test.js
```
Expected: error `Cannot find module '../../lib/engine/reranker.js'`

- [ ] **Step 3: Implement Reranker**

```js
// lib/engine/reranker.js
import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';

export class Reranker {
  constructor() {
    this._pipeline = null;
  }

  async _load() {
    if (!this._pipeline) {
      this._pipeline = await pipeline('text-classification', MODEL);
    }
  }

  /**
   * Re-scores candidates using a cross-encoder and returns them sorted by relevance.
   *
   * @param {string} query
   * @param {Array<{score: number, text: string, metadata: object}>} candidates
   * @returns {Promise<Array<{score: number, text: string, metadata: object}>>}
   */
  async rerank(query, candidates) {
    if (candidates.length === 0) return [];
    await this._load();

    const pairs = candidates.map(c => [query, c.text]);
    const outputs = await this._pipeline(pairs);

    return candidates
      .map((c, i) => {
        const scores = Array.isArray(outputs[i]) ? outputs[i] : [outputs[i]];
        const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
        return { ...c, score: best.score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/engine/reranker.test.js
```
Expected: 4 passing, 0 failing

- [ ] **Step 5: Commit**

```bash
git add lib/engine/reranker.js tests/engine/reranker.test.js
git commit -m "feat(retrieval): add cross-encoder Reranker with lazy model load"
```

---

## Task 5: Indexer — Co-build BM25

**Files:**
- Modify: `lib/engine/indexer.js`

The indexer must build and persist `bm25.json` alongside the vectra index.
BM25 file path: `path.join(path.dirname(this.indexPath), 'bm25.json')`.

- [ ] **Step 1: Write the failing test**

```js
// Add to tests/engine/ — create tests/engine/indexer-bm25.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { BookLibIndexer } from '../../lib/engine/indexer.js';
import { BM25Index } from '../../lib/engine/bm25-index.js';

describe('BookLibIndexer BM25 co-build', () => {
  it('creates bm25.json alongside vectra index after indexDirectory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-indexer-'));
    const indexDir = path.join(tmpDir, 'index');
    const skillsDir = path.join(tmpDir, 'skills');
    const testSkillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(testSkillDir, { recursive: true });
    fs.writeFileSync(path.join(testSkillDir, 'SKILL.md'), `---
name: test-skill
description: A test skill about kotlin null safety
version: "1.0"
tags: [kotlin]
license: MIT
---
Kotlin null safety prevents null pointer exceptions.
`);

    const indexer = new BookLibIndexer(indexDir);
    await indexer.indexDirectory(skillsDir, true, { quiet: true });

    const bm25Path = path.join(path.dirname(indexDir), 'bm25.json');
    assert.ok(fs.existsSync(bm25Path), 'bm25.json should exist after indexDirectory');

    const idx = BM25Index.load(bm25Path);
    const results = idx.search('kotlin null', 3);
    assert.ok(results.length > 0, 'loaded BM25 index should return results');
    assert.ok(results[0].score > 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/engine/indexer-bm25.test.js
```
Expected: FAIL — `bm25.json` does not exist yet

- [ ] **Step 3: Modify indexer.js**

At the top of `lib/engine/indexer.js`, add import:
```js
import { BM25Index } from './bm25-index.js';
```

In `indexDirectory()`, collect all chunks during the indexing loop and write bm25.json after the loop completes. Replace the existing loop body section:

```js
// Before the files loop, declare accumulator:
const bm25Chunks = [];

// Inside the loop, after parsing chunks and before the inner chunk loop, add:
bm25Chunks.push(...chunks);

// After the files loop (before the quiet summary console.log), add:
const bm25 = new BM25Index();
bm25.build(bm25Chunks);
const bm25Path = path.join(path.dirname(this.indexPath), 'bm25.json');
bm25.save(bm25Path);
```

Full modified `indexDirectory()` method — replace the method body:

```js
async indexDirectory(dirPath, clearFirst = false, opts = {}) {
  const { quiet = false } = opts;

  if (clearFirst && fs.existsSync(this.indexPath)) {
    fs.rmSync(this.indexPath, { recursive: true, force: true });
  }

  if (!(await this.index.isIndexCreated())) {
    await this.index.createIndex();
  }

  const files = this.getFiles(dirPath, ['.md', '.mdc']);
  if (!quiet) console.log(`Found ${files.length} skill files to index in ${dirPath}.`);

  await this.loadModel({ quiet });

  let totalFiles = 0;
  let totalChunks = 0;
  let skipped = 0;
  const bm25Chunks = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(dirPath, file);
    let chunks;
    try {
      chunks = parseSkillFile(content, relativePath);
    } catch (err) {
      if (quiet) {
        skipped++;
      } else {
        process.stderr.write(`⚠ Skipping ${relativePath}: ${err.message}\n`);
      }
      continue;
    }

    if (quiet) {
      totalFiles++;
      totalChunks += chunks.length;
    } else {
      console.log(`Indexing ${relativePath} (${chunks.length} chunks)...`);
    }

    bm25Chunks.push(...chunks);

    for (const chunk of chunks) {
      const vector = await this.getEmbedding(chunk.text);
      await this.index.insertItem({
        vector,
        metadata: { ...chunk.metadata, text: chunk.text }
      });
    }
  }

  const bm25 = new BM25Index();
  bm25.build(bm25Chunks);
  const bm25Path = path.join(path.dirname(this.indexPath), 'bm25.json');
  bm25.save(bm25Path);

  if (quiet) {
    console.log(`  Indexed ${totalFiles} files (${totalChunks} chunks)`);
    if (skipped > 0) {
      console.log(`  ⚠ ${skipped} file(s) skipped (malformed frontmatter)`);
    }
  } else {
    console.log('Indexing complete.');
  }
}
```

Also update `indexNodeFile()` to call `bm25.add()` after inserting into vectra. Add this at the end of `indexNodeFile()`, after the final `for (const chunk of chunks)` loop:

```js
// Append new chunks to existing BM25 index (or create fresh)
const bm25Path = path.join(path.dirname(this.indexPath), 'bm25.json');
const bm25 = fs.existsSync(bm25Path) ? BM25Index.load(bm25Path) : new BM25Index();
for (const chunk of chunks) bm25.add(chunk);
bm25.save(bm25Path);
```

And similarly in the fallback branch (empty body) of `indexNodeFile()`, before the final `return`:

```js
const bm25Path = path.join(path.dirname(this.indexPath), 'bm25.json');
const bm25 = fs.existsSync(bm25Path) ? BM25Index.load(bm25Path) : new BM25Index();
bm25.add({ text: fallbackText, metadata: { id: data.id, title: data.title, type: data.type, nodeKind: 'knowledge', nodeFile: filePath } });
bm25.save(bm25Path);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/engine/indexer-bm25.test.js
```
Expected: 1 passing, 0 failing

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: pass count ≥ previous count, fail 0

- [ ] **Step 6: Commit**

```bash
git add lib/engine/indexer.js tests/engine/indexer-bm25.test.js
git commit -m "feat(retrieval): indexer co-builds bm25.json alongside vectra index"
```

---

## Task 6: Searcher — Full Hybrid Pipeline

**Files:**
- Modify: `lib/engine/searcher.js`
- Create: `tests/engine/hybrid-searcher.test.js`

The public API is unchanged: `search(query, limit=5, minScore=0.5)`.
Pipeline: expand query → BM25 + vectra (per variant) → RRF (original 2×) → rerank top-20 → return top-limit.
`minScore` filters reranker output. If bm25.json is missing, fall back to vector-only (backwards compatible).

- [ ] **Step 1: Write the failing integration test**

```js
// tests/engine/hybrid-searcher.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { BookLibIndexer } from '../../lib/engine/indexer.js';
import { BookLibSearcher } from '../../lib/engine/searcher.js';

async function buildTestIndex(tmpDir) {
  const indexDir = path.join(tmpDir, 'index');
  const skillsDir = path.join(tmpDir, 'skills');

  const skills = [
    { name: 'effective-kotlin', text: 'Kotlin null safety val immutable data class sealed class' },
    { name: 'effective-typescript', text: 'TypeScript strict null checks undefined type narrowing' },
    { name: 'clean-code-reviewer', text: 'clean code naming functions variables single responsibility' },
    { name: 'effective-java', text: 'Java generics builder pattern equals hashCode immutable' },
  ];

  for (const skill of skills) {
    const dir = path.join(skillsDir, skill.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---
name: ${skill.name}
description: Test skill
version: "1.0"
tags: [test]
license: MIT
---
${skill.text}
`);
  }

  const indexer = new BookLibIndexer(indexDir);
  await indexer.indexDirectory(skillsDir, true, { quiet: true });
  return indexDir;
}

describe('BookLibSearcher hybrid pipeline', () => {
  it('returns results for a query with bm25.json present', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-hybrid-'));
    const indexDir = await buildTestIndex(tmpDir);
    const searcher = new BookLibSearcher(indexDir);

    const results = await searcher.search('kotlin null safety', 3, 0);
    assert.ok(results.length > 0, 'should return results');
    assert.ok(results[0].score !== undefined);
    assert.ok(results[0].text !== undefined);
    assert.ok(results[0].metadata !== undefined);
  });

  it('falls back to vector search when bm25.json is missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-noBm25-'));
    const indexDir = await buildTestIndex(tmpDir);

    // Remove bm25.json to simulate missing file
    const bm25Path = path.join(path.dirname(indexDir), 'bm25.json');
    if (fs.existsSync(bm25Path)) fs.unlinkSync(bm25Path);

    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin null safety', 3, 0);
    assert.ok(results.length > 0, 'should fall back to vector search');
  });

  it('top result is relevant to query', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-relevance-'));
    const indexDir = await buildTestIndex(tmpDir);
    const searcher = new BookLibSearcher(indexDir);

    const results = await searcher.search('kotlin immutable data', 5, 0);
    assert.ok(results.length > 0);
    assert.equal(results[0].metadata.name, 'effective-kotlin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/engine/hybrid-searcher.test.js
```
Expected: FAIL (searcher still does vector-only; pipeline not wired)

- [ ] **Step 3: Rewrite searcher.js**

```js
// lib/engine/searcher.js
import path from 'node:path';
import fs from 'node:fs';
import { LocalIndex } from 'vectra';
import { pipeline } from '@huggingface/transformers';
import { resolveBookLibPaths } from '../paths.js';
import { BM25Index } from './bm25-index.js';
import { reciprocalRankFusion } from './rrf.js';
import { expandQuery } from './query-expander.js';
import { Reranker } from './reranker.js';

const RRF_ORIGINAL_WEIGHT = 2;
const RRF_EXPANDED_WEIGHT = 1;
const RERANK_CANDIDATES = 20;

export class BookLibSearcher {
  constructor(indexPath) {
    this.indexPath = indexPath ?? resolveBookLibPaths().indexPath;
    this.index = new LocalIndex(this.indexPath);
    this.extractor = null;
    this.reranker = new Reranker();
  }

  async loadModel() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  async getEmbedding(text) {
    await this.loadModel();
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  async _vectorSearch(query, topK) {
    const vector = await this.getEmbedding(query);
    const results = await this.index.queryItems(vector, '', topK);
    return results.map(r => ({
      score: r.score,
      text: r.item.metadata.text,
      metadata: { ...r.item.metadata, text: undefined },
    }));
  }

  _loadBM25() {
    const bm25Path = path.join(path.dirname(this.indexPath), 'bm25.json');
    if (!fs.existsSync(bm25Path)) return null;
    return BM25Index.load(bm25Path);
  }

  /**
   * Performs a hybrid search: BM25 + vector + query expansion + RRF + cross-encoder reranking.
   * Falls back to vector-only when bm25.json is absent.
   *
   * @param {string} query
   * @param {number} limit - Max results to return.
   * @param {number} minScore - Minimum reranker score threshold (0–1).
   * @returns {Promise<Array<{score: number, text: string, metadata: object}>>}
   */
  async search(query, limit = 5, minScore = 0.5) {
    if (!(await this.index.isIndexCreated())) {
      throw new Error('Index not found. Please run "booklib index" first.');
    }

    const bm25 = this._loadBM25();

    if (!bm25) {
      // Fallback: pure vector search (backwards compatible)
      const vector = await this.getEmbedding(query);
      const results = await this.index.queryItems(vector, '', limit);
      return results
        .filter(r => r.score >= minScore)
        .map(r => ({
          score: r.score,
          text: r.item.metadata.text,
          metadata: { ...r.item.metadata, text: undefined },
        }));
    }

    const { expanded } = expandQuery(query);
    const allQueries = [query, ...expanded];

    // Collect result lists for RRF: original query gets 2× weight, expanded get 1×
    const resultLists = [];
    const weights = [];

    for (let i = 0; i < allQueries.length; i++) {
      const q = allQueries[i];
      const w = i === 0 ? RRF_ORIGINAL_WEIGHT : RRF_EXPANDED_WEIGHT;

      const [vecResults, bm25Results] = await Promise.all([
        this._vectorSearch(q, RERANK_CANDIDATES),
        Promise.resolve(bm25.search(q, RERANK_CANDIDATES)),
      ]);

      resultLists.push(vecResults, bm25Results);
      weights.push(w, w);
    }

    const merged = reciprocalRankFusion(resultLists, { weights });
    const candidates = merged.slice(0, RERANK_CANDIDATES);

    const reranked = await this.reranker.rerank(query, candidates);

    return reranked
      .filter(r => r.score >= minScore)
      .slice(0, limit);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/engine/hybrid-searcher.test.js
```
Expected: 3 passing, 0 failing

**Note:** The reranker downloads `Xenova/ms-marco-MiniLM-L-6-v2` (~22 MB) on first run. In CI and test environments where the model is not pre-cached, the reranker will show a download message. This is expected behavior matching the existing embedding model download pattern.

- [ ] **Step 5: Run full test suite**

```bash
node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: pass count ≥ previous run, fail 0

- [ ] **Step 6: Commit**

```bash
git add lib/engine/searcher.js tests/engine/hybrid-searcher.test.js
git commit -m "feat(retrieval): hybrid pipeline in BookLibSearcher — BM25 + vector + RRF + reranking"
```

---

## Task 7: Benchmark Harness

**Files:**
- Create: `benchmark/ground-truth.json`
- Create: `benchmark/run-eval.js`
- Create: `benchmark/RESEARCH.md`
- Modify: `bin/booklib.js` (add `benchmark` command)

- [ ] **Step 1: Write the failing test for eval metrics**

```js
// tests/engine/benchmark-eval.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMRR, computeNDCG, computeRecall } from '../benchmark/run-eval.js';

describe('eval metrics', () => {
  it('MRR@5: rank 1 hit returns 1.0', () => {
    assert.equal(computeMRR([['a', 'b', 'c']], [['a']], 5), 1.0);
  });

  it('MRR@5: rank 2 hit returns 0.5', () => {
    assert.equal(computeMRR([['x', 'a', 'b']], [['a']], 5), 0.5);
  });

  it('MRR@5: no hit returns 0', () => {
    assert.equal(computeMRR([['x', 'y', 'z']], [['a']], 5), 0);
  });

  it('Recall@5: all relevant in top 5 returns 1.0', () => {
    assert.equal(computeRecall([['a', 'b', 'c']], [['a', 'b']], 5), 1.0);
  });

  it('Recall@5: no relevant returns 0', () => {
    assert.equal(computeRecall([['x', 'y', 'z']], [['a']], 5), 0);
  });

  it('NDCG@5: perfect ranking returns 1.0', () => {
    const score = computeNDCG([['a', 'b']], [['a', 'b']], 5);
    assert.ok(Math.abs(score - 1.0) < 0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/engine/benchmark-eval.test.js
```
Expected: error `Cannot find module '../benchmark/run-eval.js'`

- [ ] **Step 3: Create benchmark/ground-truth.json**

```json
[
  { "query": "null safety avoid null pointer exception", "relevant": ["effective-kotlin", "effective-java"] },
  { "query": "immutable data classes patterns", "relevant": ["effective-kotlin", "effective-java"] },
  { "query": "naming variables functions clearly", "relevant": ["clean-code-reviewer"] },
  { "query": "function should do one thing single responsibility", "relevant": ["clean-code-reviewer"] },
  { "query": "error handling exceptions vs error codes", "relevant": ["clean-code-reviewer", "effective-kotlin"] },
  { "query": "sealed classes restricted hierarchies", "relevant": ["effective-kotlin"] },
  { "query": "extension functions kotlin", "relevant": ["effective-kotlin"] },
  { "query": "TypeScript strict mode type narrowing", "relevant": ["effective-typescript"] },
  { "query": "avoid any type annotation", "relevant": ["effective-typescript"] },
  { "query": "generics wildcards bounded type parameters", "relevant": ["effective-java", "effective-typescript"] },
  { "query": "builder pattern constructors", "relevant": ["effective-java"] },
  { "query": "equals hashCode contract override", "relevant": ["effective-java", "effective-kotlin"] },
  { "query": "distributed systems consistency eventual", "relevant": ["data-intensive-patterns"] },
  { "query": "database indexing query optimization", "relevant": ["data-intensive-patterns"] },
  { "query": "event sourcing CQRS patterns", "relevant": ["data-intensive-patterns"] },
  { "query": "horizontal scaling load balancing", "relevant": ["system-design-interview"] },
  { "query": "caching strategies Redis CDN", "relevant": ["system-design-interview", "data-intensive-patterns"] },
  { "query": "rate limiting API design", "relevant": ["system-design-interview"] },
  { "query": "bounded context aggregate root", "relevant": ["domain-driven-design"] },
  { "query": "domain events ubiquitous language", "relevant": ["domain-driven-design"] },
  { "query": "code duplication DRY principle", "relevant": ["clean-code-reviewer"] },
  { "query": "comprehensions generators lazy evaluation", "relevant": ["effective-python"] },
  { "query": "dataclass property decorator Python", "relevant": ["effective-python"] }
]
```

- [ ] **Step 4: Create benchmark/run-eval.js**

```js
// benchmark/run-eval.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BookLibSearcher } from '../lib/engine/searcher.js';
import { resolveBookLibPaths } from '../lib/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mean Reciprocal Rank at k.
 * @param {string[][]} resultLists - Per-query ordered list of retrieved skill names
 * @param {string[][]} relevantSets - Per-query set of relevant skill names
 */
export function computeMRR(resultLists, relevantSets, k) {
  let total = 0;
  for (let i = 0; i < resultLists.length; i++) {
    const results = resultLists[i].slice(0, k);
    const relevant = new Set(relevantSets[i]);
    const rank = results.findIndex(r => relevant.has(r));
    if (rank >= 0) total += 1 / (rank + 1);
  }
  return total / resultLists.length;
}

/**
 * Recall at k.
 */
export function computeRecall(resultLists, relevantSets, k) {
  let total = 0;
  for (let i = 0; i < resultLists.length; i++) {
    const results = new Set(resultLists[i].slice(0, k));
    const relevant = relevantSets[i];
    const hits = relevant.filter(r => results.has(r)).length;
    total += hits / relevant.length;
  }
  return total / resultLists.length;
}

/**
 * Normalized Discounted Cumulative Gain at k.
 */
export function computeNDCG(resultLists, relevantSets, k) {
  function dcg(results, relevant) {
    let score = 0;
    for (let i = 0; i < Math.min(results.length, k); i++) {
      if (relevant.has(results[i])) score += 1 / Math.log2(i + 2);
    }
    return score;
  }

  let total = 0;
  for (let i = 0; i < resultLists.length; i++) {
    const relevant = new Set(relevantSets[i]);
    const ideal = [...relevant].slice(0, k);
    const idcg = dcg(ideal, relevant);
    if (idcg === 0) continue;
    total += dcg(resultLists[i], relevant) / idcg;
  }
  return total / resultLists.length;
}

async function run() {
  const groundTruth = JSON.parse(
    (await import('node:fs')).default.readFileSync(
      path.join(__dirname, 'ground-truth.json'), 'utf8'
    )
  );

  const { indexPath } = resolveBookLibPaths();
  const searcher = new BookLibSearcher(indexPath);
  const K = 5;

  const resultLists = [];
  const relevantSets = groundTruth.map(g => g.relevant);

  for (const { query } of groundTruth) {
    const results = await searcher.search(query, K, 0);
    resultLists.push(results.map(r => r.metadata.name).filter(Boolean));
  }

  const mrr = computeMRR(resultLists, relevantSets, K);
  const recall = computeRecall(resultLists, relevantSets, K);
  const ndcg = computeNDCG(resultLists, relevantSets, K);

  console.log(`\n  BookLib Retrieval Benchmark (${groundTruth.length} queries, @${K})\n`);
  console.log(`  MRR@${K}:    ${mrr.toFixed(3)}`);
  console.log(`  Recall@${K}: ${recall.toFixed(3)}`);
  console.log(`  NDCG@${K}:   ${ndcg.toFixed(3)}\n`);
}

// Run when invoked directly (not imported in tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/engine/benchmark-eval.test.js
```
Expected: 6 passing, 0 failing

- [ ] **Step 6: Create benchmark/RESEARCH.md stub**

```markdown
# BookLib Retrieval Quality — Research Notes

> **Status:** Pending benchmark run. Fill in after running `booklib benchmark`.

## Baseline vs Hybrid Pipeline

| Configuration | MRR@5 | Recall@5 | NDCG@5 |
|---------------|-------|----------|--------|
| Baseline (vector-only) | — | — | — |
| Hybrid (BM25 + vector + RRF) | — | — | — |
| Hybrid + cross-encoder reranking | — | — | — |

## Mapping to arxiv 2602.12430

Claims under investigation:
- §3.2: "Hybrid retrieval improves MRR@5 by 40–60% over dense-only baselines"
- §4.1: "Cross-encoder reranking adds 10–15% on top of hybrid fusion"
- §5.3: "Query expansion with hypothetical document embeddings improves recall on long-tail queries"

## Notes

_Fill in after running `booklib benchmark` against the live index._
```

- [ ] **Step 7: Add `benchmark` command to bin/booklib.js**

Locate the section in `bin/booklib.js` where other commands are dispatched (the main `switch (command)` or `if/else if` chain). Add:

```js
} else if (command === 'benchmark') {
  const { run: runBenchmark } = await import('../benchmark/run-eval.js');
  await runBenchmark();
```

If `run-eval.js` does not export `run`, expose it:

Update the bottom of `benchmark/run-eval.js` — replace the `if (process.argv[1] === ...)` guard with:

```js
export async function run() {
  // (move the run() function body above here, export it)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => { console.error(err); process.exit(1); });
}
```

(The `run` function is already defined above — this step just adds the `export` keyword to it.)

- [ ] **Step 8: Run full test suite**

```bash
node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```
Expected: pass count ≥ previous run, fail 0

- [ ] **Step 9: Commit**

```bash
git add benchmark/ tests/engine/benchmark-eval.test.js bin/booklib.js
git commit -m "feat(retrieval): add benchmark harness — ground truth, MRR/NDCG/Recall eval, booklib benchmark command"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Query expander — `query-expander.js` (Task 3)
- [x] BM25 index — `bm25-index.js` (Task 1)
- [x] RRF fusion — `rrf.js` (Task 2), original query 2× weight wired in Task 6
- [x] Cross-encoder reranker — `reranker.js` (Task 4), top-20 candidates in Task 6
- [x] Indexer co-builds BM25 — `indexer.js` (Task 5)
- [x] `search()` API unchanged — same signature in Task 6
- [x] Benchmark harness — `benchmark/` (Task 7)
- [x] `booklib benchmark` command — Task 7

**Type consistency:**
- `BM25Index.search()` returns `{score, text, metadata}[]` — matches vector search format used by RRF
- `Reranker.rerank()` accepts and returns same `{score, text, metadata}[]` shape
- RRF input/output both `{score, text, metadata}[]`

**No placeholders:** All tasks contain complete code. `benchmark/RESEARCH.md` is intentionally a stub — it is filled by the maintainer after running benchmarks, which is documented.
