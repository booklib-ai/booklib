import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ImportChecker } from '../../lib/engine/import-checker.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-checker-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Fake searcher that reports coverage for specific module names. */
function fakeSearcher(coveredModules) {
  return {
    async search(query, limit, minScore) {
      if (coveredModules.includes(query)) {
        return [{ score: 0.8, text: `Docs for ${query}` }];
      }
      return [];
    },
  };
}

describe('ImportChecker.checkFile', () => {
  it('classifies known deps that are in the index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0', lodash: '^4.17.0' },
    }));
    fs.writeFileSync(path.join(tmpDir, 'app.js'), [
      "import express from 'express';",
      "import _ from 'lodash';",
    ].join('\n'));

    const checker = new ImportChecker({
      searcher: fakeSearcher(['express', 'lodash']),
    });

    const result = await checker.checkFile(path.join(tmpDir, 'app.js'), tmpDir);
    assert.equal(result.known.length, 2);
    assert.equal(result.unknown.length, 0);
  });

  it('classifies unknown deps not in the index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0', 'new-pkg': '^1.0.0' },
    }));
    fs.writeFileSync(path.join(tmpDir, 'app.js'), [
      "import express from 'express';",
      "import thing from 'new-pkg';",
    ].join('\n'));

    const checker = new ImportChecker({
      searcher: fakeSearcher(['express']),
    });

    const result = await checker.checkFile(path.join(tmpDir, 'app.js'), tmpDir);
    assert.equal(result.known.length, 1);
    assert.equal(result.unknown.length, 1);
    assert.equal(result.unknown[0].module, 'new-pkg');
  });

  it('puts stdlib imports (not in project deps) in skipped', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0' },
    }));
    fs.writeFileSync(path.join(tmpDir, 'app.js'), [
      "import express from 'express';",
      "import path from 'path';",
      "import fs from 'fs';",
    ].join('\n'));

    const checker = new ImportChecker({
      searcher: fakeSearcher(['express']),
    });

    const result = await checker.checkFile(path.join(tmpDir, 'app.js'), tmpDir);
    assert.equal(result.known.length, 1);
    assert.equal(result.skipped.length, 2);
  });

  it('returns empty for unsupported file types', async () => {
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body { color: red; }');

    const checker = new ImportChecker();
    const result = await checker.checkFile(path.join(tmpDir, 'style.css'), tmpDir);
    assert.equal(result.known.length, 0);
    assert.equal(result.unknown.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  it('works without a searcher (all third-party become unknown)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0' },
    }));
    fs.writeFileSync(path.join(tmpDir, 'app.js'), "import express from 'express';");

    const checker = new ImportChecker({ searcher: null });
    const result = await checker.checkFile(path.join(tmpDir, 'app.js'), tmpDir);
    assert.equal(result.unknown.length, 1);
    assert.equal(result.known.length, 0);
  });
});

describe('ImportChecker.assessQuality', () => {
  const checker = new ImportChecker();

  it('returns none for empty content', () => {
    const result = checker.assessQuality('');
    assert.equal(result.quality, 'none');
  });

  it('returns low for very short content', () => {
    const result = checker.assessQuality('Some short text about a library.');
    assert.equal(result.quality, 'none');
  });

  it('returns low for content under 200 chars', () => {
    const result = checker.assessQuality('A'.repeat(150));
    assert.equal(result.quality, 'low');
  });

  it('returns high for content with multiple code blocks', () => {
    const content = 'A'.repeat(300) + '\n```js\nconst x = 1;\n```\n```js\nconst y = 2;\n```\n```js\nconst z = 3;\n```';
    const result = checker.assessQuality(content);
    assert.equal(result.quality, 'high');
  });

  it('returns medium for content with one code block', () => {
    const content = 'A'.repeat(300) + '\n```js\nconst x = 1;\n```';
    const result = checker.assessQuality(content);
    assert.equal(result.quality, 'medium');
  });

  it('detects API patterns in content', () => {
    const content = 'A'.repeat(300) + '\nGET /api/users\nPOST /api/users\nDELETE /api/users';
    const result = checker.assessQuality(content);
    assert.equal(result.quality, 'high');
  });
});

describe('ImportChecker.resolveDocsUrl', () => {
  it('returns go pkg.go.dev URL without network', async () => {
    const checker = new ImportChecker();
    const result = await checker.resolveDocsUrl({
      module: 'github.com/gin-gonic/gin',
      language: 'go',
    });
    assert.equal(result.url, 'https://pkg.go.dev/github.com/gin-gonic/gin');
    assert.equal(result.source, 'go');
  });

  it('returns null for unknown ecosystem', async () => {
    const checker = new ImportChecker();
    const result = await checker.resolveDocsUrl({
      module: 'SwiftUI',
      language: 'swift',
    });
    assert.equal(result.url, null);
    assert.equal(result.source, 'swift');
  });
});
