import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { GapDetector } from '../../lib/engine/gap-detector.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-detector-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GapDetector.detect', () => {
  it('returns empty postTraining when no deps', async () => {
    const detector = new GapDetector({
      cachePath: path.join(tmpDir, '.booklib', 'version-cache.json'),
    });
    const result = await detector.detect(tmpDir);
    assert.equal(result.postTraining.length, 0);
    assert.equal(result.totalDeps, 0);
    assert.equal(result.ecosystems.length, 0);
  });

  it('returns correct ecosystems list from scanDependencies', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.2' },
    }));
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask==2.3.2\n');

    const detector = new GapDetector({
      cachePath: path.join(tmpDir, '.booklib', 'version-cache.json'),
      // Use very short timeout to avoid real network calls in tests
      cacheTtlMs: 0,
    });

    // Stub checkPublishDate to avoid network calls by pre-populating cache
    const cacheDir = path.join(tmpDir, '.booklib');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'version-cache.json'), JSON.stringify({
      'npm:express@4.18.2': { publishDate: '2023-01-01T00:00:00.000Z', checkedAt: Date.now() },
      'pypi:flask@2.3.2': { publishDate: '2023-06-01T00:00:00.000Z', checkedAt: Date.now() },
    }));

    const result = await detector.detect(tmpDir);
    assert.ok(result.ecosystems.includes('npm'));
    assert.ok(result.ecosystems.includes('pypi'));
    assert.equal(result.totalDeps, 2);
    assert.equal(result.checkedDeps, 2);
  });
});

describe('GapDetector._scanProjectDocs', () => {
  it('finds docs/ directory', () => {
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir);
    fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide\n');
    fs.writeFileSync(path.join(docsDir, 'api.md'), '# API\n');

    const detector = new GapDetector();
    const docs = detector._scanProjectDocs(tmpDir);
    const docsEntry = docs.find(d => d.path === 'docs');
    assert.ok(docsEntry);
    assert.equal(docsEntry.type, 'directory');
    assert.equal(docsEntry.fileCount, 2);
  });

  it('finds ARCHITECTURE.md file', () => {
    fs.writeFileSync(path.join(tmpDir, 'ARCHITECTURE.md'), '# Architecture\n');

    const detector = new GapDetector();
    const docs = detector._scanProjectDocs(tmpDir);
    const archEntry = docs.find(d => d.path === 'ARCHITECTURE.md');
    assert.ok(archEntry);
    assert.equal(archEntry.type, 'file');
    assert.equal(archEntry.fileCount, 1);
  });

  it('returns empty for project with no docs', () => {
    const detector = new GapDetector();
    const docs = detector._scanProjectDocs(tmpDir);
    assert.equal(docs.length, 0);
  });
});

describe('GapDetector cache', () => {
  it('loads and saves correctly', async () => {
    const cachePath = path.join(tmpDir, '.booklib', 'version-cache.json');

    // Start with no cache file
    const detector = new GapDetector({ cachePath });
    const emptyCache = detector._loadCache();
    assert.deepEqual(emptyCache, {});

    // Save some data
    const testCache = {
      'npm:express@4.18.2': {
        publishDate: '2023-10-01T00:00:00.000Z',
        checkedAt: Date.now(),
      },
    };
    detector._saveCache(testCache);

    // Load it back
    const loaded = detector._loadCache();
    assert.equal(loaded['npm:express@4.18.2'].publishDate, '2023-10-01T00:00:00.000Z');
  });

  it('uses cached values within TTL', async () => {
    const cachePath = path.join(tmpDir, '.booklib', 'version-cache.json');
    const cacheDir = path.join(tmpDir, '.booklib');
    fs.mkdirSync(cacheDir, { recursive: true });

    // Write a package.json and pre-populate cache with a post-cutoff date
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'my-new-lib': '2.0.0' },
    }));

    const postCutoffDate = new Date('2025-08-15T00:00:00.000Z');
    fs.writeFileSync(cachePath, JSON.stringify({
      'npm:my-new-lib@2.0.0': {
        publishDate: postCutoffDate.toISOString(),
        checkedAt: Date.now(),
      },
    }));

    const detector = new GapDetector({
      cachePath,
      cacheTtlMs: 60 * 60 * 1000, // 1h
    });

    const result = await detector.detect(tmpDir);
    // The cached post-cutoff dep should appear in postTraining
    assert.equal(result.postTraining.length, 1);
    assert.equal(result.postTraining[0].name, 'my-new-lib');
  });
});
