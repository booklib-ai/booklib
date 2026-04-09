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
    { name: 'clean-code', text: 'Naming conventions functions should do one thing comments are failures' },
    { name: 'design-patterns', text: 'Factory method abstract factory singleton builder prototype' },
    { name: 'domain-driven', text: 'Aggregates value objects bounded context ubiquitous language' },
  ];

  for (const skill of skills) {
    const dir = path.join(skillsDir, skill.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${skill.name}\ntags: [test]\n---\n${skill.text}\n`);
  }

  const indexer = new BookLibIndexer(indexDir);
  await indexer.indexDirectory(skillsDir, true, { quiet: true });
  return indexDir;
}

function isModelUnavailable(err) {
  const msg = err?.message ?? '';
  return msg.includes('Protobuf parsing failed') || msg.includes('Load model');
}

describe('BookLibSearcher hybrid pipeline', () => {
  it('returns results for a query with bm25.json present', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-hybrid-'));
    try {
      const indexDir = await buildTestIndex(tmpDir);
      const searcher = new BookLibSearcher(indexDir);
      const results = await searcher.search('kotlin null safety', 3, 0);
      assert.ok(results.length > 0, 'should return results');
      assert.ok(results[0].score !== undefined);
      assert.ok(results[0].text !== undefined);
      assert.ok(results[0].metadata !== undefined);
    } catch (err) {
      if (isModelUnavailable(err)) { t.skip('Embedding model not available on CI'); return; }
      throw err;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to vector search when bm25.json is missing', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-noBm25-'));
    try {
      const indexDir = await buildTestIndex(tmpDir);
      const bm25Path = path.join(path.dirname(indexDir), 'bm25.json');
      if (fs.existsSync(bm25Path)) fs.unlinkSync(bm25Path);
      const searcher = new BookLibSearcher(indexDir);
      const results = await searcher.search('kotlin null safety', 3, 0);
      assert.ok(results.length > 0, 'should fall back to vector search');
    } catch (err) {
      if (isModelUnavailable(err)) { t.skip('Embedding model not available on CI'); return; }
      throw err;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('top result is relevant to query', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-relevance-'));
    try {
      const indexDir = await buildTestIndex(tmpDir);
      const searcher = new BookLibSearcher(indexDir);
      const results = await searcher.search('kotlin immutable data', 5, 0);
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].metadata.name, 'effective-kotlin');
    } catch (err) {
      if (isModelUnavailable(err)) { t.skip('Embedding model not available on CI'); return; }
      throw err;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
