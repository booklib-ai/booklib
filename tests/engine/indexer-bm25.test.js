import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { BookLibIndexer } from '../../lib/engine/indexer.js';
import { BM25Index } from '../../lib/engine/bm25-index.js';

describe('BookLibIndexer recovers from corrupt vectra index.json', () => {
  it('should delete and recreate index when index.json is truncated JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-corrupt-'));
    const indexDir = path.join(tmpDir, 'index');
    const skillsDir = path.join(tmpDir, 'skills');
    const testSkillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(indexDir, { recursive: true });
    fs.mkdirSync(testSkillDir, { recursive: true });
    fs.writeFileSync(path.join(testSkillDir, 'SKILL.md'), `---
name: test-skill
tags: [test]
---
Test content for corrupt index recovery.
`);

    // Write a truncated JSON file to simulate the crash the user saw
    fs.writeFileSync(path.join(indexDir, 'index.json'), '{"version":1,"items":[{"id":"abc","metadata":{}', 'utf8');

    const indexer = new BookLibIndexer(indexDir);
    // Should not throw — should recover by deleting and recreating
    const result = await indexer.indexDirectory(skillsDir, false, { quiet: true });
    assert.ok(result.chunks > 0, 'should index successfully after recovery');

    // Verify the new index.json is valid
    const newIndex = fs.readFileSync(path.join(indexDir, 'index.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(newIndex), 'rebuilt index.json should be valid JSON');
  });
});

describe('BookLibIndexer uses batch vectra insert (single disk write)', () => {
  it('should call beginUpdate/endUpdate once, not per-item insertItem', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-batch-'));
    const indexDir = path.join(tmpDir, 'index');
    const skillsDir = path.join(tmpDir, 'skills');
    const testSkillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(testSkillDir, { recursive: true });
    fs.writeFileSync(path.join(testSkillDir, 'SKILL.md'), `---
name: test-skill
tags: [test]
---

## Section A
First chunk of content about testing.

## Section B
Second chunk of content about assertions.

## Section C
Third chunk of content about mocking.
`);

    const indexer = new BookLibIndexer(indexDir);

    // Spy on beginUpdate/endUpdate to count disk writes
    let beginCount = 0;
    let endCount = 0;
    const origBegin = indexer.index.beginUpdate.bind(indexer.index);
    const origEnd = indexer.index.endUpdate.bind(indexer.index);
    indexer.index.beginUpdate = async () => { beginCount++; return origBegin(); };
    indexer.index.endUpdate = async () => { endCount++; return origEnd(); };

    const result = await indexer.indexDirectory(skillsDir, true, { quiet: true });

    assert.ok(result.chunks >= 3, `should have at least 3 chunks, got ${result.chunks}`);
    assert.equal(beginCount, 1, 'beginUpdate should be called exactly once (batch)');
    assert.equal(endCount, 1, 'endUpdate should be called exactly once (batch)');
  });
});

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

  it('indexes chunks with parentId and siblingIndex metadata', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-idx-'));
    const indexDir = path.join(tmpDir, 'index');
    const skillsDir = path.join(tmpDir, 'skills');
    const testSkillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(testSkillDir, { recursive: true });
    fs.writeFileSync(path.join(testSkillDir, 'SKILL.md'), `---
name: test-skill
tags: [kotlin]
---

## Rules

- Use val over var for immutability
- Prefer data classes for DTOs
- Use sealed classes for state
`);

    const indexer = new BookLibIndexer(indexDir);
    await indexer.indexDirectory(skillsDir, true, { quiet: true });

    const bm25Path = path.join(path.dirname(indexDir), 'bm25.json');
    const idx = BM25Index.load(bm25Path);
    const results = idx.search('immutability val', 3);

    assert.ok(results.length > 0, 'should find results for immutability query');
    assert.ok(results[0].metadata.parentId, 'chunk should have parentId');
    assert.strictEqual(typeof results[0].metadata.siblingIndex, 'number', 'siblingIndex should be a number');
    assert.strictEqual(typeof results[0].metadata.siblingCount, 'number', 'siblingCount should be a number');
  });
});
