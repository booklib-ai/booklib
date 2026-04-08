import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve knowledge gaps by trying multiple sources in priority order.
 * Context7 (instant) -> GitHub releases -> manual suggestion.
 */
export class GapResolver {
  constructor(opts = {}) {
    this.outputBase = opts.outputBase ?? path.join(process.cwd(), '.booklib', 'sources');
  }

  /**
   * Resolve a single dependency gap.
   * @param {{ name: string, version: string, ecosystem: string }} dep
   * @returns {Promise<{ resolved: boolean, source: string, pageCount: number, suggestion?: string }>}
   */
  async resolve(dep) {
    // Try Context7 first — fastest, broadest coverage
    const ctx7Result = await this._tryContext7(dep);
    if (ctx7Result.resolved) return ctx7Result;

    // Fall back to GitHub releases
    const ghResult = await this._tryGitHub(dep);
    if (ghResult.resolved) return ghResult;

    // Last resort: manual suggestion with ecosystem-specific URL
    return this._suggestManual(dep);
  }

  /**
   * Resolve multiple gaps, returning results for each.
   * @param {Array<{ name: string, version: string, ecosystem: string }>} deps
   * @param {Function} [onProgress] - called with { dep, result, index, total }
   * @returns {Promise<Array<{ dep, result }>>}
   */
  async resolveAll(deps, onProgress) {
    const results = [];
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      const result = await this.resolve(dep);
      results.push({ dep, result });
      onProgress?.({ dep, result, index: i, total: deps.length });
    }
    return results;
  }

  /** Attempt resolution via Context7 API. */
  async _tryContext7(dep) {
    try {
      const { Context7Connector } = await import('../connectors/context7.js');
      const ctx7 = new Context7Connector();
      if (!ctx7.checkAuth().ok) return { resolved: false, source: 'context7' };

      const sourceName = `ctx7-${dep.name.replace(/[@/]/g, '_').replace(/^_+/, '')}`;
      const outputDir = path.join(this.outputBase, sourceName);
      const result = await ctx7.resolveAndFetch(
        dep.name,
        outputDir,
        `${dep.name} v${dep.version} API`,
      );

      if (result.resolved && result.pageCount > 0) {
        return {
          resolved: true,
          source: 'context7',
          pageCount: result.pageCount,
          sourceName,
          outputDir,
        };
      }
    } catch { /* Context7 unavailable */ }
    return { resolved: false, source: 'context7' };
  }

  /** Attempt resolution via GitHub release notes. npm-only. */
  async _tryGitHub(dep) {
    if (dep.ecosystem !== 'npm') return { resolved: false, source: 'github' };

    try {
      const { GitHubConnector } = await import('../connectors/github.js');
      const gh = new GitHubConnector();
      if (!gh.checkAuth().ok) return { resolved: false, source: 'github' };

      // Resolve npm package -> GitHub repo via npm registry
      const res = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(dep.name)}`,
        {
          headers: { 'Accept': 'application/vnd.npm.install-v1+json' },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) return { resolved: false, source: 'github' };

      const data = await res.json();
      const repoUrl = data.repository?.url ?? '';
      const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      if (!match) return { resolved: false, source: 'github' };

      const repo = match[1];
      const sourceName = `gh-${dep.name}-releases`;
      const outputDir = path.join(this.outputBase, sourceName);
      const result = await gh.fetchReleases(repo, outputDir, { limit: 5 });

      if (result.pageCount > 0) {
        return {
          resolved: true,
          source: 'github',
          pageCount: result.pageCount,
          sourceName,
          outputDir,
        };
      }
    } catch { /* GitHub unavailable */ }
    return { resolved: false, source: 'github' };
  }

  /** Build a manual suggestion with ecosystem-specific URL. */
  _suggestManual(dep) {
    const suggestions = {
      npm: `booklib connect https://www.npmjs.com/package/${dep.name} --type=framework-docs`,
      pypi: `booklib connect https://pypi.org/project/${dep.name}/ --type=framework-docs`,
      crates: `booklib connect https://docs.rs/${dep.name} --type=framework-docs`,
      go: `booklib connect https://pkg.go.dev/${dep.name} --type=framework-docs`,
      rubygems: `booklib connect https://rubygems.org/gems/${dep.name} --type=framework-docs`,
      maven: `booklib connect https://search.maven.org/artifact/${dep.name.replace(':', '/')} --type=framework-docs`,
    };
    return {
      resolved: false,
      source: 'manual',
      pageCount: 0,
      suggestion: suggestions[dep.ecosystem] ?? 'booklib connect <docs-url> --type=framework-docs',
    };
  }
}
