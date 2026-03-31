import { SKILL_REGISTRY } from './registry/skills.js';
import { BookLibSearcher } from './engine/searcher.js';
import { resolveBookLibPaths } from './paths.js';
import { loadConfig } from './config-loader.js';
import { DiscoveryEngine } from './discovery-engine.js';
import { ConflictResolver } from './conflict-resolver.js';

/**
 * Orchestrates the 'Suggested Retrieval' flow.
 * Combines local semantic search with registry-level keyword suggestions.
 */
export class BookLibRegistrySearcher {
  constructor(options = {}) {
    this.projectCwd = options.projectCwd;
    const paths = resolveBookLibPaths(options.projectCwd);
    this.searcher = new BookLibSearcher(paths.indexPath);
    this.config = loadConfig(options.projectCwd);
    this.threshold = this.config.search.registryFallbackThreshold;
    this.minScore = this.config.search.minScore;
  }

  async searchHybrid(query, options = {}) {
    const { useGraph = false } = options;
    // 1. Perform local semantic search
    let localResults = [];
    try {
      localResults = await this.searcher.search(query, 5, this.minScore, { useGraph });
    } catch {
      // Local index might not exist yet
    }

    // 2. Fall back to keyword matching across bundled registry + community manifest
    const bestLocalScore = localResults[0]?.score ?? 0;
    const useFallback = bestLocalScore < this.threshold;

    let suggestions = [];
    if (useFallback) {
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

      const matchesQuery = (skill) => {
        if (!skill.triggers?.keywords) return false;
        const keywordMatch = skill.triggers.keywords.some(k => {
          const kLower = k.toLowerCase();
          return queryLower.includes(kLower) ||
            kLower.split(/\s+/).some(kw => queryWords.includes(kw));
        });
        return keywordMatch ||
          skill.name.toLowerCase().includes(queryLower) ||
          queryWords.some(w => (skill.description ?? '').toLowerCase().includes(w));
      };

      const alreadyLocal = (skill) =>
        localResults.some(r => r.metadata?.name === (skill.name ?? skill.id));

      // Bundled registry suggestions
      const bundledSuggestions = SKILL_REGISTRY.filter(s => matchesQuery(s) && !alreadyLocal(s));

      // Community manifest suggestions (cached — no network call)
      let communitySuggestions = [];
      try {
        const engine = new DiscoveryEngine({ projectCwd: this.projectCwd });
        const discovered = await engine.discover();
        communitySuggestions = discovered.filter(s => matchesQuery(s) && !alreadyLocal(s));
      } catch { /* non-fatal */ }

      suggestions = [...bundledSuggestions, ...communitySuggestions];
    }

    // Run conflict resolution on suggestions using community registry metadata
    let resolved = { winners: suggestions, suppressed: [], conflicts: [] };
    if (suggestions.length > 1) {
      try {
        const engine = new DiscoveryEngine({ projectCwd: this.projectCwd });
        const allSkills = await engine.discover();
        const resolver = new ConflictResolver(allSkills);
        resolved = resolver.resolveSkills(suggestions);
      } catch { /* non-fatal — fall back to unresolved list */ }
    }

    // Run conflict resolution on local chunks using registry metadata
    let resolvedLocal = { winners: localResults, suppressed: [], conflicts: [] };
    if (localResults.length > 1) {
      try {
        const engine = new DiscoveryEngine({ projectCwd: this.projectCwd });
        const allSkills = await engine.discover();
        const resolver = new ConflictResolver(allSkills);
        resolvedLocal = resolver.resolveChunks(localResults);
      } catch { /* non-fatal */ }
    }

    return {
      local: resolvedLocal.winners,
      suggested: resolved.winners,
      suppressed: [...(resolvedLocal.suppressed ?? []), ...(resolved.suppressed ?? [])],
      conflicts: [...(resolvedLocal.conflicts ?? []), ...(resolved.conflicts ?? [])],
    };
  }
}
