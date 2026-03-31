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
