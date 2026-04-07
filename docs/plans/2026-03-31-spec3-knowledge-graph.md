# Spec 3 — Knowledge Graph + Research: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `booklib capture` for intentional knowledge capture, `--graph` flag to augment search with one-hop edge traversal, and update `benchmark/RESEARCH.md` to include a graph-augmented row.

**Architecture:** `booklib capture` writes a knowledge node + edges to `graph.jsonl`. `BookLibSearcher.search()` gains a `useGraph` option that loads `graph.jsonl` and appends linked skills/nodes to results. `BookLibRegistrySearcher.searchHybrid()` threads the option through. The CLI search command exposes `--graph`.

**Tech Stack:** Node.js ESM, `node --test`, gray-matter, existing `lib/engine/graph.js` primitives (`serializeNode`, `saveNode`, `appendEdge`, `loadEdges`, `traverseEdges`), `BookLibSearcher`, `BookLibRegistrySearcher`.

**Key constraints:**
- `booklib capture` is standalone — no Spec 2 dependency
- `--graph` is opt-in; defaults to off
- Graph augmented results have `metadata.source: 'graph'` and `score: 0`
- Only `see-also`, `applies-to`, `extends` edges are followed (discovery-relevant)
- One hop only (prevent noise from low-quality early edges)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/engine/graph.js` | Modify | Add `parseCaptureLinkArgs(linksArg)` — pure parsing, testable |
| `bin/booklib.js` | Modify | `case 'capture':` + update help text + `--graph` in `search` |
| `lib/engine/searcher.js` | Modify | `search(query, limit, minScore, options)` + `_appendGraphResults()` |
| `lib/registry-searcher.js` | Modify | Thread `useGraph` option from `searchHybrid()` to `searcher.search()` |
| `tests/engine/capture-command.test.js` | Create | Tests for `parseCaptureLinkArgs` |
| `tests/engine/graph-augmented-search.test.js` | Create | Tests for graph-augmented `search()` |
| `benchmark/RESEARCH.md` | Modify | Add graph-augmentation row + fill-in instructions |

---

## Task 1: `parseCaptureLinkArgs` + `booklib capture` command

**Files:**
- Modify: `lib/engine/graph.js` — append `parseCaptureLinkArgs` export
- Modify: `bin/booklib.js` — add `case 'capture':` + update help text
- Create: `tests/engine/capture-command.test.js`

### Step 1.1: Write failing tests for `parseCaptureLinkArgs`

Create `tests/engine/capture-command.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptureLinkArgs } from '../../lib/engine/graph.js';

test('parseCaptureLinkArgs returns empty array for empty string', () => {
  assert.deepStrictEqual(parseCaptureLinkArgs(''), []);
});

test('parseCaptureLinkArgs parses single link', () => {
  const result = parseCaptureLinkArgs('effective-kotlin:applies-to');
  assert.deepStrictEqual(result, [{ to: 'effective-kotlin', type: 'applies-to' }]);
});

test('parseCaptureLinkArgs parses multiple links', () => {
  const result = parseCaptureLinkArgs('effective-kotlin:applies-to,design-patterns:see-also');
  assert.deepStrictEqual(result, [
    { to: 'effective-kotlin', type: 'applies-to' },
    { to: 'design-patterns', type: 'see-also' },
  ]);
});

test('parseCaptureLinkArgs trims whitespace', () => {
  const result = parseCaptureLinkArgs(' effective-kotlin : applies-to ');
  assert.deepStrictEqual(result, [{ to: 'effective-kotlin', type: 'applies-to' }]);
});

test('parseCaptureLinkArgs skips malformed pairs without colon', () => {
  const result = parseCaptureLinkArgs('effective-kotlin,design-patterns:see-also');
  assert.deepStrictEqual(result, [{ to: 'design-patterns', type: 'see-also' }]);
});

test('parseCaptureLinkArgs handles skill names with hyphens', () => {
  const result = parseCaptureLinkArgs('clean-code-reviewer:see-also');
  assert.deepStrictEqual(result, [{ to: 'clean-code-reviewer', type: 'see-also' }]);
});
```

- [ ] **Step 1.1: Write the failing tests**

  Create `tests/engine/capture-command.test.js` with the content above.

- [ ] **Step 1.2: Run tests to confirm they fail**

  Run: `node --test tests/engine/capture-command.test.js`
  Expected: FAIL — `parseCaptureLinkArgs is not a function`

### Step 1.2: Implement `parseCaptureLinkArgs` in `lib/engine/graph.js`

Append to the bottom of `lib/engine/graph.js`, before the closing of the module:

```js
/**
 * Parses a links argument string like "effective-kotlin:applies-to,design-patterns:see-also"
 * into an array of { to, type } pairs. Skips entries without a colon separator.
 * @param {string} linksArg
 * @returns {{ to: string, type: string }[]}
 */
export function parseCaptureLinkArgs(linksArg) {
  if (!linksArg) return [];
  return linksArg.split(',')
    .map(pair => {
      const colonIdx = pair.lastIndexOf(':');
      if (colonIdx === -1) return null;
      return { to: pair.slice(0, colonIdx).trim(), type: pair.slice(colonIdx + 1).trim() };
    })
    .filter(Boolean);
}
```

- [ ] **Step 1.3: Add `parseCaptureLinkArgs` to `lib/engine/graph.js`**

  Append the function above to the end of `lib/engine/graph.js`.

- [ ] **Step 1.4: Run tests to confirm they pass**

  Run: `node --test tests/engine/capture-command.test.js`
  Expected: 6 tests PASS

- [ ] **Step 1.5: Commit**

  ```bash
  git add lib/engine/graph.js tests/engine/capture-command.test.js
  git commit -m "feat: add parseCaptureLinkArgs to graph.js with tests"
  ```

### Step 1.3: Add `case 'capture':` to `bin/booklib.js`

Also add `parseCaptureLinkArgs` to the existing graph.js import at line ~36 of `bin/booklib.js`:

Current import (line ~36):
```js
import {
  generateNodeId, serializeNode, saveNode, loadNode,
  listNodes, appendEdge, parseNodeFrontmatter, resolveKnowledgePaths,
  resolveNodeRef, EDGE_TYPES,
} from '../lib/engine/graph.js';
```

Change to:
```js
import {
  generateNodeId, serializeNode, saveNode, loadNode,
  listNodes, appendEdge, parseNodeFrontmatter, resolveKnowledgePaths,
  resolveNodeRef, EDGE_TYPES, parseCaptureLinkArgs,
} from '../lib/engine/graph.js';
```

Then add the `case 'capture':` block in the switch statement, immediately before `case 'benchmark':` (around line 1414):

```js
    case 'capture': {
      const title = parseFlag(args, 'title');
      const type = parseFlag(args, 'type') ?? 'insight';
      const tagsArg = parseFlag(args, 'tags') ?? '';
      const linksArg = parseFlag(args, 'links') ?? '';

      if (!title) {
        console.error('Usage: booklib capture --title "<title>" [--type insight] [--tags tag1,tag2] [--links "skill:edge-type,...]"');
        process.exit(1);
      }

      const tags = tagsArg ? tagsArg.split(',').map(t => t.trim()).filter(Boolean) : [];
      const links = parseCaptureLinkArgs(linksArg);

      // Validate edge types
      for (const link of links) {
        if (!EDGE_TYPES.includes(link.type)) {
          console.error(`Invalid edge type "${link.type}". Valid: ${EDGE_TYPES.join(', ')}`);
          process.exit(1);
        }
      }

      const id = generateNodeId('insight');
      const nodeContent = serializeNode({ id, type, title, tags });
      const filePath = saveNode(nodeContent, id);
      await autoIndexNode(filePath);

      const today = new Date().toISOString().split('T')[0];
      for (const link of links) {
        appendEdge({ from: id, to: link.to, type: link.type, weight: 1.0, created: today });
      }

      console.log(`✅ Knowledge node created: ${filePath}`);
      console.log(`   ID: ${id}`);
      if (links.length > 0) {
        console.log(`   Linked: ${links.map(l => `${l.to} (${l.type})`).join(', ')}`);
      }
      break;
    }
```

Also update both help text blocks (around lines 1438 and 1503) to include:
```
  booklib capture --title "<title>" [--type insight] [--tags t1,t2] [--links "skill:edge-type,..."]
```

- [ ] **Step 1.6: Add `parseCaptureLinkArgs` to import in `bin/booklib.js`**
- [ ] **Step 1.7: Add `case 'capture':` block to `bin/booklib.js` before `case 'benchmark':`**
- [ ] **Step 1.8: Add `booklib capture` to both help text sections in `bin/booklib.js`**

- [ ] **Step 1.9: Smoke-test the capture command manually**

  Run: `node bin/booklib.js capture --title "Test Insight" --type insight --tags test --links "effective-kotlin:applies-to"`
  Expected: `✅ Knowledge node created: ~/.booklib/knowledge/nodes/insight_XXXXXXXX.md` with `Linked: effective-kotlin (applies-to)`

- [ ] **Step 1.10: Commit**

  ```bash
  git add bin/booklib.js
  git commit -m "feat: add booklib capture command with --title --type --tags --links"
  ```

---

## Task 2: Graph-augmented search

**Files:**
- Modify: `lib/engine/searcher.js` — `search()` options + `_appendGraphResults()`
- Modify: `lib/registry-searcher.js` — thread `useGraph` through
- Modify: `bin/booklib.js` — parse `--graph` in `search` command
- Create: `tests/engine/graph-augmented-search.test.js`

### Step 2.1: Write failing tests

Create `tests/engine/graph-augmented-search.test.js`:

```js
import { test, describe } from 'node:test';
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
    { name: 'design-patterns', text: 'Design patterns singleton factory observer decorator strategy' },
    { name: 'clean-code-reviewer', text: 'clean code naming functions variables single responsibility' },
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

function writeEdge(bookLibDir, edge) {
  const graphDir = path.join(bookLibDir, 'knowledge');
  fs.mkdirSync(graphDir, { recursive: true });
  fs.appendFileSync(path.join(graphDir, 'graph.jsonl'), JSON.stringify(edge) + '\n', 'utf8');
}

describe('graph-augmented search', () => {
  test('useGraph: false returns no graph-linked results', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graph-'));
    const indexDir = await buildTestIndex(tmpDir);
    // Write an edge
    writeEdge(path.dirname(indexDir), {
      from: 'insight_abc', to: 'design-patterns', type: 'applies-to', weight: 1.0, created: '2026-03-31',
    });
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: false });
    assert.ok(results.every(r => r.metadata?.source !== 'graph'), 'no graph-linked results expected');
  });

  test('useGraph: true appends linked skill when edge exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graph-'));
    const indexDir = await buildTestIndex(tmpDir);
    const bookLibDir = path.dirname(indexDir);
    // effective-kotlin → design-patterns (applies-to)
    writeEdge(bookLibDir, {
      from: 'effective-kotlin', to: 'design-patterns', type: 'applies-to', weight: 1.0, created: '2026-03-31',
    });
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: true });
    const graphResults = results.filter(r => r.metadata?.source === 'graph');
    assert.ok(graphResults.length > 0, 'should have at least one graph-linked result');
    assert.strictEqual(graphResults[0].metadata.name, 'design-patterns');
    assert.strictEqual(graphResults[0].metadata.edgeType, 'applies-to');
  });

  test('useGraph: true does not duplicate results already in top-k', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graph-dedup-'));
    const indexDir = await buildTestIndex(tmpDir);
    const bookLibDir = path.dirname(indexDir);
    // effective-kotlin → effective-kotlin (self-loop edge)
    writeEdge(bookLibDir, {
      from: 'effective-kotlin', to: 'effective-kotlin', type: 'see-also', weight: 1.0, created: '2026-03-31',
    });
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: true });
    const names = results.map(r => r.metadata?.name);
    const unique = new Set(names.filter(Boolean));
    assert.ok(unique.size === names.filter(Boolean).length, 'no duplicate skill names in results');
  });

  test('useGraph: true ignores non-discovery edge types (contradicts, supersedes)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graph-edgetype-'));
    const indexDir = await buildTestIndex(tmpDir);
    const bookLibDir = path.dirname(indexDir);
    writeEdge(bookLibDir, {
      from: 'effective-kotlin', to: 'design-patterns', type: 'contradicts', weight: 1.0, created: '2026-03-31',
    });
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: true });
    const graphResults = results.filter(r => r.metadata?.source === 'graph');
    assert.strictEqual(graphResults.length, 0, 'contradicts edge should not produce graph-linked results');
  });

  test('useGraph: true returns normal results when graph.jsonl is absent', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graph-nofile-'));
    const indexDir = await buildTestIndex(tmpDir);
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: true });
    assert.ok(results.length > 0, 'should return normal results');
    assert.ok(results.every(r => r.metadata?.source !== 'graph'), 'no graph results when file absent');
  });
});
```

- [ ] **Step 2.1: Create `tests/engine/graph-augmented-search.test.js`** with content above.

- [ ] **Step 2.2: Run to confirm tests fail**

  Run: `node --test tests/engine/graph-augmented-search.test.js`
  Expected: FAIL — `search does not accept options` or TypeError on 4th argument

### Step 2.2: Implement graph-augmented search in `lib/engine/searcher.js`

Add `graphFile` getter and `_appendGraphResults()` method, and add `options = {}` to `search()`.

**Add import** at top of `lib/engine/searcher.js` (after existing imports):
```js
import { loadEdges, traverseEdges } from './graph.js';
```

**Add getter** after `get bm25Path()`:
```js
get graphFile() {
  return path.join(path.dirname(this.indexPath), 'knowledge', 'graph.jsonl');
}
```

**Change `search()` signature** from:
```js
async search(query, limit = 5, minScore = 0.5) {
```
to:
```js
async search(query, limit = 5, minScore = 0.5, options = {}) {
  const { useGraph = false } = options;
```

**Change the `return reranked...` at end of `search()`** from:
```js
    return reranked
      .filter(r => r.score >= minScore)
      .slice(0, limit);
```
to:
```js
    const results = reranked.filter(r => r.score >= minScore).slice(0, limit);
    return useGraph ? this._appendGraphResults(results) : results;
```

Also update the pure-vector fallback path's `return` to use `useGraph`:
```js
    // Fallback: no BM25 index present — use pure vector search (backwards compatible)
    if (!fs.existsSync(this.bm25Path)) {
      const vector = await this.getEmbedding(query);
      const results = await this.index.queryItems(vector, '', limit);
      const filtered = results
        .filter(r => r.score >= minScore)
        .map(r => ({
          score: r.score,
          text: r.item.metadata.text,
          metadata: { ...r.item.metadata, text: undefined },
        }));
      return useGraph ? this._appendGraphResults(filtered) : filtered;
    }
```

**Add `_appendGraphResults()` method** after the `search()` method:
```js
  _appendGraphResults(results) {
    const GRAPH_EDGE_TYPES = new Set(['see-also', 'applies-to', 'extends']);
    let edges;
    try {
      edges = loadEdges({ graphFile: this.graphFile });
    } catch {
      return results;
    }
    if (edges.length === 0) return results;

    const seenIds = new Set(
      results.map(r => r.metadata?.name ?? r.metadata?.id).filter(Boolean)
    );
    const graphLinked = [];

    for (const result of results) {
      const nodeId = result.metadata?.name ?? result.metadata?.id;
      if (!nodeId) continue;

      for (const { id: neighborId, edge } of traverseEdges(nodeId, edges, 1)) {
        if (!GRAPH_EDGE_TYPES.has(edge.type)) continue;
        if (seenIds.has(neighborId)) continue;
        seenIds.add(neighborId);
        graphLinked.push({
          score: 0,
          text: '',
          metadata: { name: neighborId, source: 'graph', edgeType: edge.type },
        });
      }
    }

    return [...results, ...graphLinked];
  }
```

- [ ] **Step 2.3: Add `loadEdges, traverseEdges` import to `lib/engine/searcher.js`**
- [ ] **Step 2.4: Add `get graphFile()` getter to `BookLibSearcher`**
- [ ] **Step 2.5: Update `search()` signature to accept `options = {}`**
- [ ] **Step 2.6: Update the pure-vector fallback `return` to thread `useGraph`**
- [ ] **Step 2.7: Update the `return reranked...` at end of `search()` to use `useGraph`**
- [ ] **Step 2.8: Add `_appendGraphResults()` method to `BookLibSearcher`**

- [ ] **Step 2.9: Run tests**

  Run: `node --test tests/engine/graph-augmented-search.test.js`
  Expected: 5 tests PASS

- [ ] **Step 2.10: Run existing searcher tests to verify no regressions**

  Run: `node --test tests/engine/hybrid-searcher.test.js`
  Expected: 3 tests PASS

- [ ] **Step 2.11: Commit**

  ```bash
  git add lib/engine/searcher.js tests/engine/graph-augmented-search.test.js
  git commit -m "feat: graph-augmented search with useGraph option and one-hop edge traversal"
  ```

### Step 2.3: Thread `useGraph` through `BookLibRegistrySearcher`

In `lib/registry-searcher.js`, change `searchHybrid(query)` to `searchHybrid(query, options = {})`:

```js
async searchHybrid(query, options = {}) {
  const { useGraph = false } = options;
  // 1. Perform local semantic search
  let localResults = [];
  try {
    localResults = await this.searcher.search(query, 5, this.minScore, { useGraph });
  } catch {
    // Local index might not exist yet
  }
  // ... rest unchanged
```

In `bin/booklib.js`, inside `case 'search':`, change:

Find line (around 206):
```js
    case 'search': {
      const autoFetch = args.includes('--auto-fetch');
      const roleFilter = (args.find(a => a.startsWith('--role=')) ?? '').replace('--role=', '') || null;
```

Add `--graph` parsing:
```js
    case 'search': {
      const autoFetch = args.includes('--auto-fetch');
      const useGraph = args.includes('--graph');
      const roleFilter = (args.find(a => a.startsWith('--role=')) ?? '').replace('--role=', '') || null;
```

Then change `regSearcher.searchHybrid(query)` to `regSearcher.searchHybrid(query, { useGraph })`:
```js
      let { local, suggested, conflicts } = await regSearcher.searchHybrid(query, { useGraph });
```

(There are two calls to `searchHybrid` in the search block — both need to be updated. The second one is inside the `autoFetch` re-search block, around line 241.)

Also update the search usage error message to include `[--graph]`:
```js
      if (!query) { console.error('Usage: booklib search "<query>" [--auto-fetch] [--role=<role>] [--graph]'); process.exit(1); }
```

And update the help text to show `[--graph]` on the search line.

- [ ] **Step 2.12: Update `lib/registry-searcher.js` to accept and thread `useGraph`**
- [ ] **Step 2.13: Add `--graph` parsing to the `search` command in `bin/booklib.js`**
- [ ] **Step 2.14: Update both `searchHybrid(query)` calls in the search block to pass `{ useGraph }`**
- [ ] **Step 2.15: Update search usage message and help text in `bin/booklib.js`**

- [ ] **Step 2.16: Smoke-test end-to-end**

  ```bash
  # First build an index (or skip if one exists)
  node bin/booklib.js index skills/

  # Capture a test node with a link
  node bin/booklib.js capture --title "Test graph link" --type insight --links "effective-kotlin:see-also"

  # Search with --graph
  node bin/booklib.js search "kotlin patterns" --graph
  ```
  Expected: output includes "effective-kotlin" in local results AND any graph-linked results marked with source: graph if the index has other skills.

- [ ] **Step 2.17: Commit**

  ```bash
  git add lib/registry-searcher.js bin/booklib.js
  git commit -m "feat: wire --graph flag through registry-searcher to CLI search command"
  ```

---

## Task 3: Update `benchmark/RESEARCH.md`

**Files:**
- Modify: `benchmark/RESEARCH.md`

Replace the current stub content with a more complete document that:
1. Adds a "Graph-augmented" row to the results table
2. Provides concrete instructions for the maintainer on how to fill it in
3. Notes which arxiv claims the graph augmentation tests

- [ ] **Step 3.1: Update `benchmark/RESEARCH.md`**

Replace the current content with:

```markdown
# BookLib Retrieval Quality — Research Notes

> **Status:** Pending benchmark run. Fill in after running `booklib benchmark`.

## How to Generate These Results

1. Build the full skill index: `node bin/booklib.js index skills/`
2. Run the benchmark: `node bin/booklib.js benchmark`
3. Record MRR@5, Recall@5, NDCG@5 in the table below for each configuration.
4. For the graph-augmented row: capture a few test nodes linking related skills, then re-run.

## Retrieval Quality Results

| Configuration | MRR@5 | Recall@5 | NDCG@5 |
|---------------|-------|----------|--------|
| Baseline (vector-only, pre-Spec-2) | — | — | — |
| Hybrid (BM25 + vector + RRF) | — | — | — |
| Hybrid + cross-encoder reranking | — | — | — |
| Graph-augmented (hybrid + reranking + `--graph`) | — | — | — |

## Mapping to arxiv 2602.12430

Claims under investigation:

- **§3.2**: "Hybrid retrieval improves MRR@5 by 40–60% over dense-only baselines"
  → Compare row 1 vs row 3 above.

- **§4.1**: "Cross-encoder reranking adds 10–15% on top of hybrid fusion"
  → Compare row 2 vs row 3 above.

- **§5.3**: "Query expansion with hypothetical document embeddings improves recall on long-tail queries"
  → Examine Recall@5 on long-tail queries in `benchmark/ground-truth.json` (queries 18–23).

- **Graph augmentation** (BookLib-specific, not in arxiv): Does one-hop edge traversal via
  `--graph` improve Recall@5 on multi-skill queries? Capture 10 cross-skill insight nodes
  linking related skills, re-run benchmark, compare row 3 vs row 4.

## Notes

- The `benchmark/ground-truth.json` file contains 23 curated query→skill pairs.
- Baseline numbers should be captured *before* switching to the hybrid pipeline (use git to
  revert `lib/engine/searcher.js` temporarily if the baseline run was missed).
- All rows should be produced from the same index build to ensure comparability.
```

- [ ] **Step 3.2: Commit**

  ```bash
  git add benchmark/RESEARCH.md
  git commit -m "docs: update RESEARCH.md with graph-augmentation row and maintainer instructions"
  ```

---

## Final Check

- [ ] **Step 4.1: Run all engine tests**

  Run: `node --test tests/engine/capture-command.test.js tests/engine/graph-augmented-search.test.js tests/engine/hybrid-searcher.test.js tests/engine/graph.test.js`
  Expected: all PASS

- [ ] **Step 4.2: Verify `booklib capture --help` output**

  Run: `node bin/booklib.js --help` (or `node bin/booklib.js` for the default help)
  Expected: `booklib capture` appears in the output

- [ ] **Step 4.3: Verify `booklib search --help` includes `[--graph]`**
