import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Context7Connector } from '../../lib/connectors/context7.js';

/**
 * Subclass that stubs _apiGet to avoid real network calls.
 * Mock responses are keyed by endpoint prefix for targeted stubbing.
 */
class TestContext7Connector extends Context7Connector {
  constructor(mockResponses = {}) {
    super({ apiKey: 'test-key' });
    this._mocks = mockResponses;
  }
  async _apiGet(endpoint) {
    // Match by endpoint prefix (ignoring query params for simpler stubbing)
    for (const [key, value] of Object.entries(this._mocks)) {
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
      const result = c.checkAuth();
      assert.equal(result.ok, true);
      assert.equal(result.error, undefined);
    });

    it('returns ok:true even without API key (works without auth)', () => {
      const c = new Context7Connector({ apiKey: undefined });
      const result = c.checkAuth();
      assert.equal(result.ok, true);
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
      const long = 'a'.repeat(200);
      assert.equal(c._sanitize(long).length, 80);
    });

    it('handles combined transformations', () => {
      const result = c._sanitize('My Doc: A "Guide" to <Things>');
      assert.equal(result, 'my-doc_-a-_guide_-to-_things_');
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
      assert.equal(results[0].name, 'Next.js');
      assert.equal(results[0].totalSnippets, 100);
      assert.equal(results[1].totalSnippets, 50);
    });

    it('returns null when API returns no results', async () => {
      const c = new TestContext7Connector({
        '/v2/libs/search': { results: null },
      });
      const results = await c.searchLibrary('nonexistent');
      assert.equal(results, null);
    });

    it('returns null when API returns empty data', async () => {
      const c = new TestContext7Connector({});
      const results = await c.searchLibrary('nonexistent');
      assert.equal(results, null);
    });

    it('uses libraryId fallback when id is missing', async () => {
      const c = new TestContext7Connector({
        '/v2/libs/search': {
          results: [{ libraryId: '/org/lib', title: 'Lib' }],
        },
      });
      const results = await c.searchLibrary('lib');
      assert.equal(results[0].id, '/org/lib');
      assert.equal(results[0].name, 'Lib');
    });
  });

  describe('fetchDocs (with stubbed API)', () => {
    it('saves codeSnippets and infoSnippets as markdown files', async () => {
      const outputDir = path.join(tmpDir, 'docs-out');
      const c = new TestContext7Connector({
        '/v2/context': {
          codeSnippets: [
            { title: 'Server Components', content: '```jsx\nexport default function Page() {}\n```', source: 'docs/app-router' },
          ],
          infoSnippets: [
            { title: 'Routing Guide', text: 'App Router uses file-system routing.', source: 'docs/routing' },
          ],
        },
      });

      const result = await c.fetchDocs('/vercel/next.js', 'app router', outputDir);
      assert.equal(result.pageCount, 2);

      const files = fs.readdirSync(outputDir).sort();
      assert.equal(files.length, 2);

      const codeContent = fs.readFileSync(path.join(outputDir, files[1]), 'utf8');
      assert.ok(codeContent.includes('# Server Components'));
      assert.ok(codeContent.includes('export default function Page'));
      assert.ok(codeContent.includes('_Source: docs/app-router_'));

      const infoContent = fs.readFileSync(path.join(outputDir, files[0]), 'utf8');
      assert.ok(infoContent.includes('# Routing Guide'));
      assert.ok(infoContent.includes('file-system routing'));
    });

    it('returns pageCount 0 when no docs', async () => {
      const outputDir = path.join(tmpDir, 'empty-out');
      const c = new TestContext7Connector({
        '/v2/context': { codeSnippets: [], infoSnippets: [] },
      });

      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 0);
      assert.ok(fs.existsSync(outputDir)); // dir created even if empty
    });

    it('returns pageCount 0 when API returns null', async () => {
      const outputDir = path.join(tmpDir, 'null-out');
      const c = new TestContext7Connector({});

      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 0);
    });

    it('handles array response format', async () => {
      const outputDir = path.join(tmpDir, 'array-out');
      const c = new TestContext7Connector({
        '/v2/context': [
          { title: 'Page 1', content: 'Content one' },
          { title: 'Page 2', content: 'Content two', source: 'https://docs.example.com' },
        ],
      });

      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 2);

      const files = fs.readdirSync(outputDir);
      assert.equal(files.length, 2);
    });

    it('generates fallback title for docs without one', async () => {
      const outputDir = path.join(tmpDir, 'fallback-out');
      const c = new TestContext7Connector({
        '/v2/context': {
          codeSnippets: [{ content: 'some code' }],
        },
      });

      const result = await c.fetchDocs('/org/lib', 'query', outputDir);
      assert.equal(result.pageCount, 1);

      const files = fs.readdirSync(outputDir);
      // Title defaults to 'Code' from the mapping
      assert.ok(files[0].startsWith('code'));
    });
  });

  describe('resolveAndFetch (with stubbed API)', () => {
    it('searches then fetches docs for best match', async () => {
      const outputDir = path.join(tmpDir, 'resolve-out');
      const c = new TestContext7Connector({
        '/v2/libs/search': {
          results: [
            { id: '/vercel/next.js', name: 'Next.js', description: 'React framework' },
          ],
        },
        '/v2/context': {
          codeSnippets: [
            { title: 'Getting Started', content: 'npx create-next-app' },
          ],
        },
      });

      const result = await c.resolveAndFetch('next', outputDir);
      assert.equal(result.resolved, true);
      assert.equal(result.libraryId, '/vercel/next.js');
      assert.equal(result.pageCount, 1);
    });

    it('returns resolved:false when library not found', async () => {
      const outputDir = path.join(tmpDir, 'not-found');
      const c = new TestContext7Connector({
        '/v2/libs/search': { results: [] },
      });

      const result = await c.resolveAndFetch('nonexistent-lib', outputDir);
      assert.equal(result.resolved, false);
      assert.equal(result.pageCount, 0);
    });

    it('returns resolved:false when search returns null', async () => {
      const outputDir = path.join(tmpDir, 'null-search');
      const c = new TestContext7Connector({});

      const result = await c.resolveAndFetch('unknown', outputDir);
      assert.equal(result.resolved, false);
      assert.equal(result.pageCount, 0);
    });

    it('uses custom query when provided', async () => {
      const outputDir = path.join(tmpDir, 'custom-query');
      let searchQuery, fetchQuery;

      const c = new TestContext7Connector({});
      // Override to capture the queries passed through
      c._apiGet = async (endpoint) => {
        if (endpoint.startsWith('/v2/libs/search')) {
          searchQuery = new URLSearchParams(endpoint.split('?')[1]).get('query');
          return { results: [{ id: '/org/lib', name: 'Lib' }] };
        }
        if (endpoint.startsWith('/v2/context')) {
          fetchQuery = new URLSearchParams(endpoint.split('?')[1]).get('query');
          return { codeSnippets: [{ title: 'Doc', content: 'content' }] };
        }
        return null;
      };

      await c.resolveAndFetch('react', outputDir, 'hooks tutorial');
      assert.equal(searchQuery, 'hooks tutorial');
      assert.equal(fetchQuery, 'hooks tutorial');
    });
  });
});
