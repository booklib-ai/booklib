import fs from 'node:fs';
import path from 'node:path';
import { scanDependencies, checkPublishDate, CUTOFF_DATE, CONCURRENCY } from './registries.js';

/**
 * Detect knowledge gaps in the current project by checking dependency
 * publish dates against the model training cutoff.
 */
export class GapDetector {
  constructor(opts = {}) {
    this.cutoffDate = opts.cutoffDate ?? CUTOFF_DATE;
    this.cachePath = opts.cachePath ?? path.join(process.cwd(), '.booklib', 'version-cache.json');
    this.cacheTtlMs = opts.cacheTtlMs ?? 24 * 60 * 60 * 1000; // 24h
  }

  /**
   * Scan project and detect all gaps.
   * @param {string} projectDir
   * @returns {Promise<{postTraining: Array, uncapturedDocs: Array, ecosystems: string[], totalDeps: number, checkedDeps: number}>}
   */
  async detect(projectDir) {
    const deps = scanDependencies(projectDir);
    const ecosystems = [...new Set(deps.map(d => d.ecosystem))];

    const cache = this._loadCache();

    // Process deps in batches to avoid blasting registries with hundreds of concurrent requests
    const results = [];
    for (let i = 0; i < deps.length; i += CONCURRENCY) {
      const batch = deps.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(dep => this._checkDep(dep, cache)));
      results.push(...batchResults);
      // Save cache after each batch so progress survives crashes
      this._saveCache(cache);
    }

    // Aggregate — no shared mutable state during async work
    const postTraining = results.filter(r => r.postTraining).map(r => r.postTraining);
    const checked = results.map(r => r.dep);

    const uncapturedDocs = this._scanProjectDocs(projectDir);

    return {
      postTraining,
      uncapturedDocs,
      ecosystems,
      totalDeps: deps.length,
      checkedDeps: checked.length,
    };
  }

  /** Check a single dep against cache or registry, returning result without side effects. */
  async _checkDep(dep, cache) {
    const cacheKey = `${dep.ecosystem}:${dep.name}@${dep.version}`;

    if (cache[cacheKey] && Date.now() - cache[cacheKey].checkedAt < this.cacheTtlMs) {
      if (cache[cacheKey].publishDate) {
        const pubDate = new Date(cache[cacheKey].publishDate);
        if (pubDate > this.cutoffDate) {
          return { dep, postTraining: { ...dep, publishDate: pubDate } };
        }
      }
      return { dep, postTraining: null };
    }

    const publishDate = await checkPublishDate(dep);
    cache[cacheKey] = {
      publishDate: publishDate?.toISOString() ?? null,
      checkedAt: Date.now(),
    };

    if (publishDate && publishDate > this.cutoffDate) {
      return { dep, postTraining: { ...dep, publishDate } };
    }
    return { dep, postTraining: null };
  }

  /**
   * Find project documentation directories and files that are not yet
   * connected to BookLib as knowledge sources.
   * @param {string} projectDir
   * @returns {Array<{path: string, type: string, fileCount: number}>}
   */
  _scanProjectDocs(projectDir) {
    const docPaths = ['docs', 'decisions', 'specs', 'adrs', 'architecture'];
    const docFiles = ['ARCHITECTURE.md', 'CONVENTIONS.md', 'DECISIONS.md', 'ADR.md'];
    const found = [];

    for (const dir of docPaths) {
      const full = path.join(projectDir, dir);
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        const fileCount = fs.readdirSync(full).filter(f => /\.(md|mdx|txt)$/i.test(f)).length;
        if (fileCount > 0) {
          found.push({ path: dir, type: 'directory', fileCount });
        }
      }
    }

    for (const file of docFiles) {
      if (fs.existsSync(path.join(projectDir, file))) {
        found.push({ path: file, type: 'file', fileCount: 1 });
      }
    }

    return found;
  }

  _loadCache() {
    try {
      return JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _saveCache(cache) {
    try {
      const dir = path.dirname(this.cachePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(cache, null, 2));
    } catch { /* best effort */ }
  }
}
