import fs from 'node:fs';
import path from 'node:path';

const CONTEXT7_API = 'https://context7.com/api';
const TIMEOUT_MS = 10000;

export class Context7Connector {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey ?? process.env.CONTEXT7_API_KEY;
  }

  /**
   * Context7 works without an API key (rate-limited).
   * With a key, higher rate limits apply.
   * @returns {{ ok: boolean }}
   */
  checkAuth() {
    return { ok: true };
  }

  /**
   * Search for a library by name.
   * @param {string} libraryName - e.g., "next", "react", "stripe"
   * @param {string} [query] - optional query for relevance ranking
   * @returns {Promise<Array<{ id: string, name: string, description: string, versions?: string[] }> | null>}
   */
  async searchLibrary(libraryName, query) {
    const params = new URLSearchParams({
      libraryName,
      query: query ?? libraryName,
    });
    const data = await this._apiGet(`/v2/libs/search?${params}`);
    if (!data?.results) return null;
    return data.results.map(r => ({
      id: r.id ?? r.libraryId,
      name: r.name ?? r.title ?? libraryName,
      description: r.description ?? '',
      versions: r.versions ?? [],
      totalSnippets: r.totalSnippets ?? r.snippetCount ?? 0,
    }));
  }

  /**
   * Fetch documentation for a library and save as markdown files.
   * @param {string} libraryId - Context7 library ID (e.g., "/vercel/next.js")
   * @param {string} query - what to search for in the docs
   * @param {string} outputDir - where to save markdown
   * @returns {Promise<{ pageCount: number }>}
   */
  async fetchDocs(libraryId, query, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    const params = new URLSearchParams({
      libraryId,
      query,
      type: 'json',
    });
    const data = await this._apiGet(`/v2/context?${params}`);

    // Handle both response formats
    let docs = [];
    if (data?.codeSnippets || data?.infoSnippets) {
      docs = [
        ...(data.codeSnippets ?? []).map(s => ({
          title: s.title ?? 'Code',
          content: s.content ?? s.code ?? '',
          source: s.source ?? '',
        })),
        ...(data.infoSnippets ?? []).map(s => ({
          title: s.title ?? 'Info',
          content: s.content ?? s.text ?? '',
          source: s.source ?? '',
        })),
      ];
    } else if (Array.isArray(data)) {
      docs = data;
    }

    if (docs.length === 0) return { pageCount: 0 };

    try {
      let count = 0;
      for (const doc of docs) {
        const title = doc.title || `doc-${count}`;
        const filename = this._sanitize(title) + '.md';
        const lines = [
          `# ${title}`,
          '',
          doc.content ?? '',
        ];
        if (doc.source) lines.push('', `_Source: ${doc.source}_`);
        fs.writeFileSync(path.join(outputDir, filename), lines.join('\n') + '\n');
        count++;
      }
      return { pageCount: count };
    } catch (err) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      throw err;
    }
  }

  /**
   * Resolve a package name to a Context7 library and fetch its docs.
   * Convenience method combining searchLibrary + fetchDocs.
   * @param {string} packageName - e.g., "next", "react"
   * @param {string} outputDir
   * @param {string} [query] - what aspect to fetch docs for
   * @returns {Promise<{ resolved: boolean, libraryId?: string, pageCount: number }>}
   */
  async resolveAndFetch(packageName, outputDir, query) {
    const libraries = await this.searchLibrary(
      packageName,
      query ?? `${packageName} API documentation`,
    );
    if (!libraries || libraries.length === 0) {
      return { resolved: false, pageCount: 0 };
    }

    const best = libraries[0];
    const result = await this.fetchDocs(
      best.id,
      query ?? `${packageName} usage guide API`,
      outputDir,
    );

    return { resolved: true, libraryId: best.id, pageCount: result.pageCount };
  }

  /** GET request to Context7 API. */
  async _apiGet(endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${CONTEXT7_API}${endpoint}`, {
        signal: controller.signal,
        headers: {
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
          'X-Context7-Source': 'booklib',
          'User-Agent': 'BookLib/1.0',
        },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Sanitize a string for use as a filename. */
  _sanitize(str) {
    return str
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 80)
      .toLowerCase();
  }
}
