import fs from 'fs';
import path from 'path';
import { SKILL_REGISTRY } from './registry/skills.js';
import { BookLibSearcher } from './engine/searcher.js';

/**
 * Orchestrates the 'Suggested Retrieval' flow.
 * Combines local search results with global registry suggestions.
 */
export class BookLibRegistrySearcher {
  constructor() {
    this.searcher = new BookLibSearcher();
  }

  async searchHybrid(query) {
    // 1. Perform local semantic search
    let localResults = [];
    try {
      localResults = await this.searcher.search(query, 3, 0.6);
    } catch (e) {
      // Local index might not exist yet
    }

    // 2. Search Global Registry for keyword matches
    const suggestions = SKILL_REGISTRY.filter(skill => 
      skill.keywords.some(k => query.toLowerCase().includes(k)) ||
      skill.name.toLowerCase().includes(query.toLowerCase())
    );

    return {
      local: localResults,
      suggested: suggestions.filter(s => !localResults.some(l => l.metadata.name === s.id))
    };
  }
}
