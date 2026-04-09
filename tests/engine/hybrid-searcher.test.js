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
  it('returns results for a query with bm25.json present', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-hybrid-'));
    const indexDir = await buildTestIndex(tmpDir);
    const searcher = new BookLibSearcher(indexDir);

    try {
      const results = await searcher.search('kotlin null safety', 3, 0);
      assert.ok(results.length > 0, 'should return results');
      assert.ok(results[0].score !== undefined);
      assert.ok(results[0].text !== undefined);
      assert.ok(results[0].metadata !== undefined);
    } catch (err) {
      if (err.message?.includes('Protobuf parsing failed') || err.message?.includes('Load model')) {
        t.skip('Reranker model not available on CI');
        return;
      }
      throw err;
    }
  });

  it('falls back to vector search when bm25.json is missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-noBm25-'));
    const indexDir = await buildTestIndex(tmpDir);

    const bm25Path = path.join(path.dirname(indexDir), 'bm25.json');
    if (fs.existsSync(bm25Path)) fs.unlinkSync(bm25Path);

    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin null safety', 3, 0);
    assert.ok(results.length > 0, 'should fall back to vector search');
  });

  it('top result is relevant to query', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-relevance-'));
    const indexDir = await buildTestIndex(tmpDir);
    const searcher = new BookLibSearcher(indexDir);

    try {
      const results = await searcher.search('kotlin immutable data', 5, 0);
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].metadata.name, 'effective-kotlin');
    } catch (err) {
      if (err.message?.includes('Protobuf parsing failed') || err.message?.includes('Load model')) {
        t.skip('Reranker model not available on CI');
        return;
      }
      throw err;
    }
  });
});
