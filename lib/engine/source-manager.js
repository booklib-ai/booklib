import fs from 'node:fs';
import path from 'node:path';

/**
 * Manages documentation source registration, listing, and removal.
 * Sources are persisted in .booklib/sources.json.
 */
export class SourceManager {
  constructor(booklibDir) {
    this.booklibDir = booklibDir;
    this.registryPath = path.join(booklibDir, 'sources.json');
  }

  /** Load registry from disk, returning empty structure if file missing or corrupt. */
  _loadRegistry() {
    if (!fs.existsSync(this.registryPath)) {
      return { sources: [] };
    }
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { sources: [] };
    }
  }

  /** Persist registry to disk, creating the directory if needed. */
  _saveRegistry(registry) {
    fs.mkdirSync(this.booklibDir, { recursive: true });
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2), 'utf8');
  }

  /**
   * Register a new documentation source.
   * @param {object} opts
   * @param {string} [opts.name] - Display name (derived from path basename if omitted).
   * @param {string} opts.sourcePath - Absolute path to the documentation directory.
   * @param {string} opts.type - Source type (e.g. 'local', 'git', 'url').
   * @param {string} [opts.url] - Optional remote URL.
   * @returns {object} The registered source entry.
   */
  registerSource({ name, sourcePath, type, url }) {
    const registry = this._loadRegistry();
    const resolvedName = name ?? path.basename(sourcePath);

    if (!/^[a-zA-Z0-9._-]+$/.test(resolvedName)) {
      throw new Error(
        `Invalid source name: "${resolvedName}". Names may only contain letters, digits, dots, hyphens, and underscores.`
      );
    }

    const existing = registry.sources.find(s => s.name === resolvedName);
    if (existing) {
      throw new Error(`Source already exists: "${resolvedName}". Use a different --name.`);
    }

    const entry = {
      name: resolvedName,
      sourcePath,
      type,
      ...(url ? { url } : {}),
      created_at: new Date().toISOString(),
      indexed_at: null,
      chunk_count: 0,
    };

    registry.sources.push(entry);
    this._saveRegistry(registry);
    return entry;
  }

  /** Return all registered sources. */
  listSources() {
    return this._loadRegistry().sources;
  }

  /**
   * Return a single source by name, or null if not found.
   * @param {string} name
   * @returns {object|null}
   */
  getSource(name) {
    const registry = this._loadRegistry();
    return registry.sources.find(s => s.name === name) ?? null;
  }

  /**
   * Remove a source from the registry by name.
   * Does not delete indexed chunks -- caller handles that separately.
   * @param {string} name
   */
  removeSource(name) {
    const registry = this._loadRegistry();
    const idx = registry.sources.findIndex(s => s.name === name);
    if (idx === -1) {
      throw new Error(`Source not found: "${name}". Run 'booklib sources' to see registered sources.`);
    }
    registry.sources.splice(idx, 1);
    this._saveRegistry(registry);
  }

  /**
   * Update the indexed_at timestamp and chunk count after indexing completes.
   * @param {string} name
   * @param {number} chunkCount
   */
  markIndexed(name, chunkCount) {
    const registry = this._loadRegistry();
    const source = registry.sources.find(s => s.name === name);
    if (!source) {
      throw new Error(`Source not found: "${name}". Register it first with 'booklib connect'.`);
    }
    source.indexed_at = new Date().toISOString();
    source.chunk_count = chunkCount;
    this._saveRegistry(registry);
  }

  /**
   * Store file modification times for incremental re-indexing.
   * @param {string} name - Source name.
   * @param {Object} mtimes - { [relativePath]: mtimeMs }
   */
  updateMtimes(name, mtimes) {
    const registry = this._loadRegistry();
    const source = registry.sources.find(s => s.name === name);
    if (!source) {
      throw new Error(`Source not found: "${name}".`);
    }
    source.file_mtimes = mtimes;
    this._saveRegistry(registry);
  }

  /**
   * Retrieve stored file modification times for a source.
   * @param {string} name - Source name.
   * @returns {Object} { [relativePath]: mtimeMs } or empty object.
   */
  getMtimes(name) {
    const source = this.getSource(name);
    return source?.file_mtimes ?? {};
  }
}
