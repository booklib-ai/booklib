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
    // Point to a skill that is not indexed, so it cannot appear in top-k on its own
    writeEdge(bookLibDir, {
      from: 'effective-kotlin', to: 'not-indexed-skill', type: 'applies-to', weight: 1.0, created: '2026-03-31',
    });
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: true });
    const graphResults = results.filter(r => r.metadata?.source === 'graph');
    assert.ok(graphResults.length > 0, 'should have at least one graph-linked result');
    assert.strictEqual(graphResults[0].metadata.name, 'not-indexed-skill');
    assert.strictEqual(graphResults[0].metadata.edgeType, 'applies-to');
  });

  test('useGraph: true does not duplicate results already in top-k', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-graph-dedup-'));
    const indexDir = await buildTestIndex(tmpDir);
    const bookLibDir = path.dirname(indexDir);
    writeEdge(bookLibDir, {
      from: 'effective-kotlin', to: 'effective-kotlin', type: 'see-also', weight: 1.0, created: '2026-03-31',
    });
    const searcher = new BookLibSearcher(indexDir);
    const results = await searcher.search('kotlin immutable', 5, 0, { useGraph: true });
    const names = results.map(r => r.metadata?.name).filter(Boolean);
    const unique = new Set(names);
    assert.strictEqual(unique.size, names.length, 'no duplicate skill names in results');
  });

  test('useGraph: true ignores non-discovery edge types (contradicts)', async () => {
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
