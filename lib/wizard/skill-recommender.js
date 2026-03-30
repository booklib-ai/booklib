// lib/wizard/skill-recommender.js
import { BookLibSearcher } from '../engine/searcher.js';
import { loadSkillCatalog, getEmbeddings } from './registry-embeddings.js';

export const SKILL_LIMIT = 32;

/**
 * Cosine similarity between two vectors. Exported for testing.
 */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Filters and ranks pre-scored catalog by installed exclusion and slot limit.
 * Exported for testing.
 *
 * @param {Array<{name, score}>} catalog - already scored entries
 * @param {{ installedNames: string[], available: number }} opts
 */
export function filterAndRank(catalog, { installedNames = [], available = SKILL_LIMIT } = {}) {
  const installed = new Set(installedNames.map(n => n.toLowerCase()));
  return catalog
    .filter(s => !installed.has(s.name.toLowerCase()))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, available);
}

/**
 * Returns ranked skill recommendations.
 *
 * @param {string} query - Free-text user goal (may be empty)
 * @param {object} opts
 * @param {string[]} opts.languages - Detected project languages
 * @param {string[]} opts.installedNames - Already-installed skill names to exclude
 * @param {number}   opts.slotsUsed - Current installed slot count
 * @param {Function} [opts.onEmbeddingProgress] - (done, total) => void
 * @returns {Promise<Array<{name, description, source, score, entry?}>>}
 */
export async function recommend(query, {
  languages = [],
  installedNames = [],
  slotsUsed = 0,
  onEmbeddingProgress,
} = {}) {
  const catalog    = loadSkillCatalog();
  const embeddings = await getEmbeddings(onEmbeddingProgress);
  const available  = Math.max(0, SKILL_LIMIT - slotsUsed);

  // Build query: user text + language hints
  const queryText = [query, ...languages.map(l => `${l} programming`)].filter(Boolean).join('. ')
    || 'software engineering best practices';

  const searcher = new BookLibSearcher();
  const queryVec = await searcher.getEmbedding(queryText);

  const scored = catalog.map(s => ({
    ...s,
    score: embeddings.has(s.name) ? cosine(queryVec, embeddings.get(s.name)) : 0,
  }));

  return filterAndRank(scored, { installedNames, available });
}
