import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebConnector } from '../../lib/connectors/web.js';

describe('WebConnector', () => {
  it('converts HTML to markdown via turndown', () => {
    const wc = new WebConnector();
    const html = '<h1>Title</h1><p>Some <strong>bold</strong> text</p>';
    const md = wc.turndown.turndown(html);
    assert.ok(md.includes('# Title'));
    assert.ok(md.includes('**bold**'));
  });

  it('strips nav, footer, script, style from HTML', () => {
    const wc = new WebConnector();
    const html = '<nav>menu</nav><main><p>content</p></main><footer>foot</footer><script>alert(1)</script>';
    const clean = wc._extractContent(html);
    assert.ok(!clean.includes('menu'));
    assert.ok(!clean.includes('foot'));
    assert.ok(!clean.includes('alert'));
    assert.ok(clean.includes('content'));
  });

  it('extracts links within same domain and path prefix', () => {
    const wc = new WebConnector();
    const html = `
      <a href="/docs/api/cache">Cache</a>
      <a href="/docs/api/router">Router</a>
      <a href="/blog/post">Blog</a>
      <a href="https://other.com/docs">Other</a>
      <a href="/docs/api/image.png">Image</a>
    `;
    const baseUrl = new URL('https://example.com/docs/api');
    const links = wc._extractLinks(html, baseUrl, '/docs/api');
    assert.ok(links.includes('https://example.com/docs/api/cache'));
    assert.ok(links.includes('https://example.com/docs/api/router'));
    assert.ok(!links.some(l => l.includes('blog')));
    assert.ok(!links.some(l => l.includes('other.com')));
    assert.ok(!links.some(l => l.includes('.png')));
  });

  it('converts URL to filename correctly', () => {
    const wc = new WebConnector();
    const baseUrl = new URL('https://example.com/docs');
    assert.equal(wc._urlToFilename('https://example.com/docs/api/cache', baseUrl), 'api-cache.md');
    assert.equal(wc._urlToFilename('https://example.com/docs', baseUrl), 'index.md');
    assert.equal(wc._urlToFilename('https://example.com/docs/', baseUrl), 'index.md');
  });

  it('respects depth=0 (single page only)', () => {
    const wc = new WebConnector({ depth: 0 });
    assert.equal(wc.depth, 0);
  });

  it('deduplicates extracted links', () => {
    const wc = new WebConnector();
    const html = '<a href="/docs/a">A</a><a href="/docs/a">A again</a>';
    const baseUrl = new URL('https://example.com/docs');
    const links = wc._extractLinks(html, baseUrl, '/docs');
    assert.equal(links.filter(l => l.includes('/docs/a')).length, 1);
  });

  it('strips HTML comments from content', () => {
    const wc = new WebConnector();
    const html = '<p>before</p><!-- secret comment --><p>after</p>';
    const clean = wc._extractContent(html);
    assert.ok(!clean.includes('secret comment'));
    assert.ok(clean.includes('before'));
    assert.ok(clean.includes('after'));
  });

  it('uses default options when none provided', () => {
    const wc = new WebConnector();
    assert.equal(wc.depth, 1);
    assert.equal(wc.rateMs, 1000);
  });
});
