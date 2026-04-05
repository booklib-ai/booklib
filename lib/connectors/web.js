import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';

export class WebConnector {
  constructor(opts = {}) {
    this.depth = opts.depth ?? 1;
    this.rateMs = opts.rateMs ?? 1000;
    this.turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }

  /**
   * Scrape a URL and optionally follow links up to this.depth.
   * Returns the local directory path where markdown files were saved.
   */
  async scrape(url, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const visited = new Set();
    const baseUrl = new URL(url);
    const basePath = baseUrl.pathname;

    await this._crawl(url, baseUrl, basePath, outputDir, 0, visited);
    return { dir: outputDir, pageCount: visited.size };
  }

  async _crawl(url, baseUrl, basePath, outputDir, currentDepth, visited) {
    if (visited.has(url) || currentDepth > this.depth) return;
    visited.add(url);

    // Rate limiting — skip delay for the first page
    if (visited.size > 1) await this._sleep(this.rateMs);

    if (this._isInternalUrl(url)) {
      console.error(`  ⚠ Skipping internal URL: ${url}`);
      return;
    }

    let html;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BookLib/1.0 (documentation indexer)' },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!res.ok) { console.error(`  ⚠ ${res.status} ${url}`); return; }
      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      if (contentLength > 10 * 1024 * 1024) {
        console.error(`  ⚠ Skipping ${url} — too large (${contentLength} bytes)`);
        return;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return;
      html = await res.text();
    } catch (err) {
      console.error(`  ⚠ Failed: ${url} — ${err.message}`);
      return;
    } finally {
      clearTimeout(timeout);
    }

    // Strip nav/footer/script/style, then convert to markdown
    const cleanHtml = this._extractContent(html);
    const markdown = this.turndown.turndown(cleanHtml);

    const filename = this._urlToFilename(url, baseUrl);
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, markdown);
    console.log(`  ✓ ${filename} (${markdown.length} chars)`);

    // Follow links only within the same domain + path prefix
    if (currentDepth < this.depth) {
      const links = this._extractLinks(html, baseUrl, basePath);
      for (const link of links) {
        await this._crawl(link, baseUrl, basePath, outputDir, currentDepth + 1, visited);
      }
    }
  }

  _extractContent(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }

  _extractLinks(html, baseUrl, basePath) {
    const links = [];
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        const resolved = new URL(match[1], baseUrl.origin);
        if (resolved.hostname === baseUrl.hostname &&
            resolved.pathname.startsWith(basePath) &&
            !resolved.hash &&
            !resolved.pathname.match(/\.(png|jpg|gif|svg|css|js|ico|woff|ttf|eot)$/i)) {
          links.push(resolved.href);
        }
      } catch { /* invalid URL, skip */ }
    }
    return [...new Set(links)];
  }

  _urlToFilename(url, baseUrl) {
    const parsed = new URL(url);
    let name = parsed.pathname
      .replace(baseUrl.pathname, '')
      .replace(/^\/|\/$/g, '')
      .replace(/\//g, '-') || 'index';
    if (name.includes('..') || name.startsWith('/')) name = 'page-' + Date.now();
    return name + '.md';
  }

  _isInternalUrl(url) {
    const hostname = new URL(url).hostname;
    if (hostname === 'localhost' || hostname === '0.0.0.0') return true;
    const parts = hostname.split('.');
    if (parts[0] === '127') return true;
    if (parts[0] === '10') return true;
    if (parts[0] === '172' && +parts[1] >= 16 && +parts[1] <= 31) return true;
    if (parts[0] === '192' && parts[1] === '168') return true;
    if (parts[0] === '169' && parts[1] === '254') return true;
    return false;
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
