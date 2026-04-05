import fs from 'node:fs';
import path from 'node:path';
import { parseImports, detectLanguage } from './import-parser.js';
import { scanDependencies } from './registries.js';

const TIMEOUT_MS = 5000;
const SEARCH_THRESHOLD = 0.5;

/**
 * Map language key to ecosystem name for registry lookups.
 * @type {Record<string, string>}
 */
const LANG_TO_ECOSYSTEM = {
  js: 'npm', python: 'pypi', go: 'go', rust: 'crates',
  java: 'maven', kotlin: 'maven', ruby: 'rubygems',
  php: 'packagist', csharp: 'nuget', swift: 'swift',
  dart: 'dart',
};

/**
 * Registry base URLs for resolving documentation.
 * @type {Record<string, string>}
 */
const REGISTRY_URLS = {
  npm: 'https://registry.npmjs.org/',
  pypi: 'https://pypi.org/pypi/',
  crates: 'https://crates.io/api/v1/crates/',
  rubygems: 'https://rubygems.org/api/v1/gems/',
  packagist: 'https://packagist.org/packages/',
};

/**
 * Fetch JSON with timeout — same pattern as registries.js.
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<object|null>}
 */
async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BookLib/1.0' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if a file's imports are covered by BookLib's index.
 * Detects unknown third-party APIs that may need documentation.
 */
export class ImportChecker {
  /**
   * @param {object} [opts]
   * @param {object} [opts.searcher] - BookLibSearcher instance
   * @param {'manual'|'semi-auto'|'auto'} [opts.indexMode]
   */
  constructor(opts = {}) {
    this.searcher = opts.searcher ?? null;
    this.indexMode = opts.indexMode ?? 'manual';
  }

  /**
   * Check a file's imports against the BookLib index.
   * @param {string} filePath - path to the source file
   * @param {string} [projectDir] - project root for dependency scanning
   * @returns {Promise<{unknown: Array, known: Array, skipped: Array}>}
   */
  async checkFile(filePath, projectDir) {
    const language = detectLanguage(filePath);
    if (!language) return { unknown: [], known: [], skipped: [] };

    const code = fs.readFileSync(filePath, 'utf8');
    const imports = parseImports(code, language);
    const depDir = projectDir ?? this._findProjectRoot(filePath);
    const projectDeps = scanDependencies(depDir);

    return this._classifyImports(imports, projectDeps);
  }

  /**
   * Classify imports as known, unknown, or skipped.
   * @param {Array<{module: string, language: string}>} imports
   * @param {Array<{name: string, ecosystem: string}>} projectDeps
   * @returns {Promise<{unknown: Array, known: Array, skipped: Array}>}
   */
  async _classifyImports(imports, projectDeps) {
    const depNames = new Set(projectDeps.map(d => d.name));
    const thirdParty = imports.filter(i => depNames.has(i.module));
    const skipped = imports.filter(i => !depNames.has(i.module));

    const unknown = [];
    const known = [];

    for (const imp of thirdParty) {
      const isKnown = await this._searchIndex(imp.module);
      if (isKnown) {
        known.push(imp);
      } else {
        unknown.push(imp);
      }
    }

    return { unknown, known, skipped };
  }

  /**
   * Search BookLib index for coverage of a module.
   * @param {string} moduleName
   * @returns {Promise<boolean>} true if found with sufficient score
   */
  async _searchIndex(moduleName) {
    if (!this.searcher) return false;
    try {
      const results = await this.searcher.search(moduleName, 1, SEARCH_THRESHOLD);
      return results.length > 0;
    } catch {
      // Index may not exist — treat as not found
      return false;
    }
  }

  /**
   * Walk up from filePath to find a directory with a dependency manifest.
   * @param {string} filePath
   * @returns {string}
   */
  _findProjectRoot(filePath) {
    const manifests = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml'];
    let dir = path.dirname(path.resolve(filePath));
    const root = path.parse(dir).root;

    while (dir !== root) {
      if (manifests.some(f => fs.existsSync(path.join(dir, f)))) return dir;
      dir = path.dirname(dir);
    }
    return process.cwd();
  }

  /**
   * Resolve docs URL for a package from its registry metadata.
   * @param {{ module: string, language: string }} imp
   * @returns {Promise<{ url: string|null, source: string }>}
   */
  async resolveDocsUrl(imp) {
    const ecosystem = LANG_TO_ECOSYSTEM[imp.language];
    if (!ecosystem) return { url: null, source: 'unknown' };

    const resolver = DOCS_RESOLVERS[ecosystem];
    if (!resolver) return { url: null, source: ecosystem };

    const url = await resolver(imp.module);
    return { url, source: ecosystem };
  }

  /**
   * Check fetched docs quality before indexing.
   * @param {string} content - fetched doc content
   * @returns {{ quality: 'high'|'medium'|'low'|'none', reason: string }}
   */
  assessQuality(content) {
    if (!content || content.length < 50) {
      return { quality: 'none', reason: 'Content too short or empty' };
    }
    if (content.length < 200) {
      return { quality: 'low', reason: 'Content under 200 characters' };
    }

    const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
    const apiPatterns = (content.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+\//gi) || []).length;
    const importLines = (content.match(/\bimport\s+|require\s*\(/gi) || []).length;

    const signals = codeBlocks + apiPatterns + importLines;
    if (signals >= 3) return { quality: 'high', reason: `${signals} code/API signals found` };
    if (signals >= 1) return { quality: 'medium', reason: `${signals} code/API signal(s) found` };
    return { quality: 'low', reason: 'No code blocks or API patterns detected' };
  }
}

/**
 * Ecosystem-specific docs URL resolvers.
 * Each returns a URL string or null.
 * @type {Record<string, (name: string) => Promise<string|null>>}
 */
const DOCS_RESOLVERS = {
  async npm(name) {
    const data = await fetchWithTimeout(`${REGISTRY_URLS.npm}${encodeURIComponent(name)}`);
    return data?.homepage || data?.repository?.url || null;
  },

  async pypi(name) {
    const data = await fetchWithTimeout(`${REGISTRY_URLS.pypi}${encodeURIComponent(name)}/json`);
    const urls = data?.info?.project_urls;
    return urls?.Documentation || urls?.Homepage || data?.info?.home_page || null;
  },

  async crates(name) {
    const data = await fetchWithTimeout(`${REGISTRY_URLS.crates}${encodeURIComponent(name)}`);
    return data?.crate?.documentation || data?.crate?.homepage || null;
  },

  go(name) {
    return Promise.resolve(`https://pkg.go.dev/${name}`);
  },

  async rubygems(name) {
    const data = await fetchWithTimeout(`${REGISTRY_URLS.rubygems}${encodeURIComponent(name)}.json`);
    return data?.documentation_uri || data?.homepage_uri || null;
  },

  async packagist(name) {
    const data = await fetchWithTimeout(`${REGISTRY_URLS.packagist}${name}.json`);
    return data?.package?.homepage || null;
  },
};
