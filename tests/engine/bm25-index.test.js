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
    assert.strictEqual(results[0].metadata.name, 'effective-kotlin');
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
    assert.strictEqual(results.length, 0);
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
      assert.deepEqual(original.map(r => r.metadata.name), restored.map(r => r.metadata.name));
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

  it('search on empty index returns empty array', () => {
    const idx = new BM25Index();
    const results = idx.search('kotlin', 5);
    assert.deepEqual(results, []);
  });

  it('search with all short tokens returns empty array', () => {
    const idx = new BM25Index();
    idx.build(CHUNKS);
    const results = idx.search('a b', 5);
    assert.strictEqual(results.length, 0);
  });

  it('add() works on a fresh index without prior build()', () => {
    const idx = new BM25Index();
    idx.add({ text: 'kotlin extension function', metadata: { name: 'effective-kotlin' } });
    const results = idx.search('kotlin extension', 3);
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].metadata.name, 'effective-kotlin');
  });
});
