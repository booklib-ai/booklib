import fs from 'fs';
import path from 'path';
import https from 'https';
import { resolveBookLibPaths } from './paths.js';
import { loadConfig } from './config-loader.js';

const DISCOVERED_FILENAME = 'discovered.json';
const GITHUB_AUTH_HEADER = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

/**
 * Scans approved sources (GitHub orgs, npm scopes) for available skills.
 * Results are cached with a TTL to avoid hammering external APIs.
 */
export class DiscoveryEngine {
  constructor(options = {}) {
    this.paths = resolveBookLibPaths(options.projectCwd);
    this.config = loadConfig(options.projectCwd);
    this.cacheFile = path.join(this.paths.cachePath, DISCOVERED_FILENAME);
  }

  /**
   * Returns all discoverable skills from approved sources.
   * Uses cache if fresh; re-scans if stale or missing.
   *
   * @returns {Array<object>} List of discovered skill descriptors
   */
  async discover() {
    const cached = this._loadCache();
    if (cached) return cached;

    const results = [];

    for (const source of this.config.sources) {
      if (source.type === 'registry') continue; // bundled registry handled separately
      try {
        const found = await this._scanSource(source);
        results.push(...found);
      } catch {
        // Non-fatal: skip unreachable sources
      }
    }

    this._saveCache(results);
    return results;
  }

  /**
   * Forces a re-scan, ignoring any cached results.
   */
  async refresh() {
    this._clearCache();
    return this.discover();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  async _scanSource(source) {
    if (source.type === 'github-org') {
      return this._scanGitHubOrg(source);
    }
    if (source.type === 'npm-scope') {
      return this._scanNpmScope(source);
    }
    if (source.type === 'manifest') {
      return this._scanManifest(source);
    }
    if (source.type === 'github-skills-dir') {
      return this._scanGitHubSkillsDir(source);
    }
    return [];
  }

  /**
   * Scans a specific directory in a GitHub repo for subdirectories containing SKILL.md.
   * Fetches the frontmatter from each SKILL.md to populate name/description.
   *
   * Source format:
   *   { type: 'github-skills-dir', repo: 'owner/repo', dir: 'skills', branch: 'main', trusted: false }
   */
  async _scanGitHubSkillsDir(source) {
    const { repo, dir = 'skills', branch = 'main', trusted = false } = source;
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${dir}`;

    let entries;
    try {
      entries = await this._fetchJson(apiUrl);
    } catch {
      return [];
    }

    if (!Array.isArray(entries)) return [];

    const skills = [];
    const subdirs = entries.filter(e => e.type === 'dir');

    for (const subdir of subdirs) {
      const skillUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${dir}/${subdir.name}/SKILL.md`;
      const exists = await this._urlExists(skillUrl);
      if (!exists) continue;

      // Fetch first 25 lines to extract frontmatter name/description without loading full file
      let name = subdir.name;
      let description = '';
      try {
        const head = await this._fetchHead(skillUrl, 25);
        const nameMatch = head.match(/^name:\s*(.+)$/m);
        if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
        description = this._parseFrontmatterDescription(head);
      } catch { /* use defaults */ }

      skills.push({
        name,
        description,
        source: { type: 'github', url: skillUrl, repo, dir: subdir.name },
        triggers: { extensions: [], keywords: name.split('-') },
        trusted,
      });
    }

    return skills;
  }

  /** Fetches just the first N lines of a text file (avoids downloading large files). */
  _fetchHead(url, lines = 20) {
    return new Promise((resolve, reject) => {
      const options = { headers: { 'User-Agent': 'booklib-discovery/1.0', 'Range': 'bytes=0-2000', ...GITHUB_AUTH_HEADER } };
      https.get(url, options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data.split('\n').slice(0, lines).join('\n')));
      }).on('error', reject);
    });
  }

  /**
   * Fetches a JSON manifest file (local path or HTTPS URL) and returns its skill list.
   * Manifest format: { version: 1, skills: [{ name, description, stars, source, trusted, ... }] }
   */
  async _scanManifest(source) {
    let data;
    if (source.url.startsWith('http')) {
      data = await this._fetchJson(source.url);
    } else {
      // Local file path (absolute or relative to cwd)
      const filePath = path.resolve(source.url);
      if (!fs.existsSync(filePath)) return [];
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
    }

    const skills = data?.skills ?? [];
    // Allow the source entry to override trusted for the whole manifest
    return skills.map(skill => ({
      ...skill,
      trusted: source.trusted ?? skill.trusted ?? false,
    }));
  }

  /**
   * Lists repositories in a GitHub org and checks each for a SKILL.md at the root.
   */
  async _scanGitHubOrg(source) {
    const { org, trusted = false } = source;
    const reposUrl = `https://api.github.com/orgs/${org}/repos?per_page=100&type=public`;

    let repos;
    try {
      const body = await this._fetchJson(reposUrl);
      repos = Array.isArray(body) ? body : [];
    } catch {
      return [];
    }

    const skills = [];
    for (const repo of repos) {
      const skillUrl = `https://raw.githubusercontent.com/${org}/${repo.name}/main/SKILL.md`;
      const exists = await this._urlExists(skillUrl);
      if (exists) {
        skills.push({
          name: repo.name,
          description: repo.description ?? '',
          source: { type: 'github', org, repo: repo.name, url: skillUrl },
          trusted,
        });
      }
    }
    return skills;
  }

  /**
   * Searches npm for packages in a given scope and checks each for a SKILL.md in their dist.
   */
  async _scanNpmScope(source) {
    const { scope, trusted = false } = source;
    const searchUrl = `https://registry.npmjs.org/-/v1/search?text=scope:${scope.replace('@', '')}&size=50`;

    let body;
    try {
      body = await this._fetchJson(searchUrl);
    } catch {
      return [];
    }

    const packages = body?.objects ?? [];
    return packages.map(pkg => ({
      name: pkg.package.name,
      description: pkg.package.description ?? '',
      source: { type: 'npm', package: pkg.package.name, version: pkg.package.version },
      trusted,
    }));
  }

  // ── Cache helpers ──────────────────────────────────────────────────────────

  _loadCache() {
    if (!fs.existsSync(this.cacheFile)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      const ttlMs = (this.config.discovery.ttlHours ?? 24) * 60 * 60 * 1000;
      if (Date.now() - data.timestamp < ttlMs) {
        return data.skills;
      }
    } catch { /* corrupt cache */ }
    return null;
  }

  _saveCache(skills) {
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    fs.writeFileSync(this.cacheFile, JSON.stringify({ timestamp: Date.now(), skills }, null, 2));
  }

  _clearCache() {
    if (fs.existsSync(this.cacheFile)) fs.unlinkSync(this.cacheFile);
  }

  // ── Frontmatter helpers ────────────────────────────────────────────────────

  /**
   * Extracts description from YAML frontmatter, handling all common formats:
   *   description: single line value
   *   description: "quoted value"
   *   description: |
   *     block scalar (literal, preserves newlines)
   *   description: >
   *     folded scalar (folds newlines to spaces)
   */
  _parseFrontmatterDescription(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^description:\s*(.*)/);
      if (!m) continue;
      const inline = m[1].trim();
      // Block/folded scalar — collect indented continuation lines
      if (inline === '|' || inline === '>') {
        const parts = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^\s+/) || lines[j].trim() === '') {
            const part = lines[j].trim();
            if (part) parts.push(part);
            else break;
          } else break;
        }
        return parts.join(inline === '>' ? ' ' : ' ').trim();
      }
      // Strip surrounding quotes
      return inline.replace(/^["']|["']$/g, '');
    }
    return '';
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      const options = { headers: { 'User-Agent': 'booklib-discovery/1.0', ...GITHUB_AUTH_HEADER } };
      https.get(url, options, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchJson(res.headers.location));
        }
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
        });
      }).on('error', reject);
    });
  }

  _urlExists(url) {
    return new Promise(resolve => {
      const options = { method: 'HEAD', headers: { 'User-Agent': 'booklib-discovery/1.0', ...GITHUB_AUTH_HEADER } };
      https.request(url, options, res => resolve(res.statusCode === 200))
        .on('error', () => resolve(false))
        .end();
    });
  }
}
