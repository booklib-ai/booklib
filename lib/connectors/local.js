import fs from 'node:fs';
import path from 'node:path';

/**
 * Local filesystem connector for BookLib.
 * Walks directories, applies include/exclude filters, tracks mtimes for
 * incremental re-indexing, and optionally watches for changes.
 */
export class LocalConnector {
  constructor(opts = {}) {
    this.include = opts.include ?? ['*.md', '*.mdx', '*.txt', '*.rst', '*.adoc'];
    this.exclude = opts.exclude ?? ['node_modules', '.git', '.booklib'];
  }

  /**
   * List files matching include/exclude filters.
   * @param {string} dirPath - Absolute directory path to walk.
   * @returns {string[]} Sorted absolute file paths.
   */
  listFiles(dirPath) {
    const results = [];
    this._walk(dirPath, dirPath, results);
    return results.sort();
  }

  /**
   * Get mtimes for all matching files, keyed by relative path.
   * @param {string} dirPath
   * @returns {Object} { [relativePath]: mtimeMs }
   */
  getFileMtimes(dirPath) {
    const files = this.listFiles(dirPath);
    const mtimes = {};
    for (const f of files) {
      mtimes[path.relative(dirPath, f)] = fs.statSync(f).mtimeMs;
    }
    return mtimes;
  }

  /**
   * Find files that changed since last index.
   * @param {string} dirPath
   * @param {Object} previousMtimes - { [relativePath]: mtimeMs } from last index.
   * @returns {{ changed: string[], removed: string[], currentMtimes: Object }}
   */
  findChanges(dirPath, previousMtimes = {}) {
    const currentMtimes = this.getFileMtimes(dirPath);
    const changed = [];
    const removed = [];

    for (const [rel, mtime] of Object.entries(currentMtimes)) {
      if (!previousMtimes[rel] || previousMtimes[rel] < mtime) {
        changed.push(path.join(dirPath, rel));
      }
    }

    for (const rel of Object.keys(previousMtimes)) {
      if (!currentMtimes[rel]) {
        removed.push(rel);
      }
    }

    return { changed, removed, currentMtimes };
  }

  /**
   * Watch directory for changes, calling callback on each matching file event.
   * @param {string} dirPath
   * @param {function} onChange - Called with (eventType, filename).
   * @returns {fs.FSWatcher}
   */
  watch(dirPath, onChange) {
    console.log(`Watching ${dirPath} for changes (Ctrl+C to stop)...`);
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (!this._matchesFilters(filename)) return;
      onChange(eventType, filename);
    });
    return watcher;
  }

  /**
   * Check if a filename matches include patterns and does not match exclude.
   * @param {string} filename
   * @returns {boolean}
   */
  _matchesFilters(filename) {
    for (const excl of this.exclude) {
      if (filename.includes(excl)) return false;
    }
    const ext = path.extname(filename).toLowerCase();
    const includeExts = this.include.map(p => p.startsWith('*.') ? p.slice(1) : p);
    return includeExts.some(e => ext === e);
  }

  /** Recursively walk a directory, collecting matching files. */
  _walk(currentDir, rootDir, results) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (this.exclude.some(excl => entry.name === excl)) continue;
        this._walk(fullPath, rootDir, results);
      } else if (entry.isFile() && this._matchesFilters(entry.name)) {
        results.push(fullPath);
      }
    }
  }
}
