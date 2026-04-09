import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Context7Connector } from '../../lib/connectors/context7.js';

/**
 * Subclass that stubs _apiGet and _apiGetText to avoid real network calls.
 */
class TestContext7Connector extends Context7Connector {
  constructor(mockResponses = {}, mockTextResponses = {}) {
    super({ apiKey: 'test-key' });
    this._mocks = mockResponses;
    this._textMocks = mockTextResponses;
  }
  async _apiGet(endpoint) {
    for (const [key, value] of Object.entries(this._mocks)) {
      if (endpoint.startsWith(key)) return value;
    }
    return null;
  }
  async _apiGetText(endpoint) {
    for (const [key, value] of Object.entries(this._textMocks)) {
      if (endpoint.startsWith(key)) return value;
    }
    return null;
  }
}

describe('Context7Connector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-ctx7-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('checkAuth', () => {
    it('returns ok:true when API key is set', () => {
      const c = new Context7Connector({ apiKey: 'ctx7_test123' });
      assert.equal(c.checkAuth().ok, true);
    });

    it('returns ok:true even without API key (works without auth)', () => {
      const c = new Context7Connector({ apiKey: undefined });
      assert.equal(c.checkAuth().ok, true);
    });
  });

  describe('_sanitize', () => {
    const c = new Context7Connector({ apiKey: 'test' });

    it('replaces special characters with underscores', () => {
      assert.equal(c._sanitize('file/name:with*special'), 'file_name_with_special');
    });

    it('replaces spaces with hyphens', () => {
      assert.equal(c._sanitize('my file name'), 'my-file-name');
    });

    it('lowercases the result', () => {
      assert.equal(c._sanitize('MyPage'), 'mypage');
    });

    it('truncates to 80 chars', () => {
      assert.equal(c._sanitize('a'.repeat(200)).length, 80);
    });
  });

  describe('searchLibrary (with stubbed API)', () => {
    it('returns mapped library results', async () => {
      const c = new TestContext7Connector({
        '/v2/libs/search': {
          results: [
            { id: '/vercel/next.js', name: 'Next.js', description: 'React framework', versions: ['15.0'], totalSnippets: 100 },
            { id: '/facebook/react', name: 'React', description: 'UI library', snippetCount: 50 },
          ],
        },
      });
      const results = await c.searchLibrary('next');
      assert.equal(results.length, 2);
      assert.equal(results[0].id, '/vercel/next.js');
      assert.equal(results[0].totalSnippets, 100);
      assert.equal(results[1].totalSnippets, 50);
    });

    it('returns null when API returns no results', async () => {
      const c = new TestContext7Connector({ '/v2/libs/search': { results: null } });
      assert.equal(await c.searchLibrary('nonexistent'), null);
    });

    it('returns null when API returns empty data', async () => {
      const c = new TestContext7Connector({});
      assert.equal(await c.searchLibrary('nonexistent'), null);
    });
  });

  describe('fetchDocs (with stubbed API — text format)', () => {
    it('saves sections split by separator as individual markdown files', async () => {
      const outputDir = path.join(tmpDir, 'docs-out');
      const mockText = `### Server Components

Use server components for data fetching.

\`\`\`jsx
export default function Page() {}
\`\`\`

Source: docs/app-router

--------------------------------

### Routing Guide

App Router uses file-system routing.

Source: docs/routing`;

      const c = new TestContext7Connector({}, { '/v2/context': mockText });
      const result = await c.fetchDocs('/vercel/next.js', 'app router', outputDir);
      assert.equal(result.pageCount, 2);

      const files = fs.readdirSync(outputDir).sort();
      assert.equal(files.length, 2);

      const content1 = fs.readFileSync(path.join(outputDir, files[1]), 'utf8');
      assert.ok(content1.includes('Server Components'));
      assert.ok(content1.includes('export default function Page'));

      const content2 = fs.readFileSync(path.join(outputDir, files[0]), 'utf8');
      assert.ok(content2.includes('Routing Guide'));
      assert.ok(content2.includes('file-system routing'));
    });

    it('returns pageCount 0 when API returns empty text', async () => {
      const outputDir = path.join(tmpDir, 'empty-out');
      const c = new TestContext7Connector({}, { '/v2/context': '' });
      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 0);
    });

    it('returns pageCount 0 when API returns null', async () => {
      const outputDir = path.join(tmpDir, 'null-out');
      const c = new TestContext7Connector({}, {});
      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 0);
    });

    it('saves as single file when no section separators', async () => {
      const outputDir = path.join(tmpDir, 'single-out');
      const mockText = `### Getting Started

Install with npm install next. Then run npx create-next-app.

This is a complete guide to Next.js.`;

      const c = new TestContext7Connector({}, { '/v2/context': mockText });
      const result = await c.fetchDocs('/vercel/next.js', 'install', outputDir);
      assert.equal(result.pageCount, 1);

      const files = fs.readdirSync(outputDir);
      assert.equal(files.length, 1);
      // Single section — saved with title from heading or as docs.md
      assert.ok(files[0].endsWith('.md'), 'should be a markdown file');
    });

    it('filters empty sections from split', async () => {
      const outputDir = path.join(tmpDir, 'filter-out');
      const mockText = `### Section One

Content one.

--------------------------------

--------------------------------

### Section Two

Content two.`;

      const c = new TestContext7Connector({}, { '/v2/context': mockText });
      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 2);
    });
  });

  describe('resolveAndFetch (with stubbed API)', () => {
    it('searches then fetches docs for best match', async () => {
      const outputDir = path.join(tmpDir, 'resolve-out');
      const c = new TestContext7Connector(
        { '/v2/libs/search': { results: [{ id: '/vercel/next.js', name: 'Next.js' }] } },
        { '/v2/context': '### Getting Started\n\nnpx create-next-app\n\nThis is useful content that is long enough.' }
      );
      const result = await c.resolveAndFetch('next', outputDir);
      assert.equal(result.resolved, true);
      assert.equal(result.libraryId, '/vercel/next.js');
      assert.ok(result.pageCount >= 1);
    });

    it('returns resolved:false when library not found', async () => {
      const outputDir = path.join(tmpDir, 'not-found');
      const c = new TestContext7Connector({ '/v2/libs/search': { results: [] } });
      const result = await c.resolveAndFetch('nonexistent-lib', outputDir);
      assert.equal(result.resolved, false);
    });

    it('returns resolved:false when search returns null', async () => {
      const outputDir = path.join(tmpDir, 'null-search');
      const c = new TestContext7Connector({});
      const result = await c.resolveAndFetch('unknown', outputDir);
      assert.equal(result.resolved, false);
    });
  });
});
