import { extractFromResults } from './principle-extractor.js';

/**
 * Transforms raw search results into structured MCP response format.
 * Returns actionable principles or "no relevant knowledge found."
 *
 * @param {string} query - the original query
 * @param {Array} results - raw search results from BookLibSearcher.search()
 * @param {object} [opts]
 * @param {number} [opts.maxPrinciples=3] - max principles to return
 * @param {string} [opts.file] - optional file path for context
 * @returns {object} structured response
 */
export function buildStructuredResponse(query, results, opts = {}) {
  const { maxPrinciples = 3, file } = opts;

  if (!results || results.length === 0) {
    return {
      query,
      file: file ?? null,
      results: [],
      note: 'No relevant knowledge found.',
    };
  }

  const principles = extractFromResults(results, maxPrinciples);

  if (principles.length === 0) {
    return {
      query,
      file: file ?? null,
      results: [],
      note: 'Search returned results but no extractable principles found.',
    };
  }

  // Count unique sources
  const sources = new Set(principles.map(p => p.source));
  const note = `${principles.length} result${principles.length > 1 ? 's' : ''} from ${sources.size} source${sources.size > 1 ? 's' : ''}.`;

  return {
    query,
    file: file ?? null,
    results: principles,
    note,
  };
}
