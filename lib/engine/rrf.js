/**
 * Reciprocal Rank Fusion (RRF) — merge multiple ranked lists into a single sorted list.
 * Items appearing in multiple lists accumulate scores; deduplication uses `text` as the identity key.
 *
 * Formula: contribution of item at rank r (0-indexed) in list i = weights[i] / (k + r + 1)
 *
 * @param {Array<Array<{score, text, metadata}>>} resultLists - One ranked list per retrieval source
 * @param {Object} options
 * @param {number} [options.k=60] - Smoothing constant (from RRF literature)
 * @param {number[]} [options.weights] - Per-list multipliers (default: all 1)
 * @returns {Array<{score, text, metadata}>} Merged and sorted descending by RRF score
 */
export function reciprocalRankFusion(resultLists, { k = 60, weights } = {}) {
  // Handle empty input
  if (!resultLists || resultLists.length === 0) {
    return [];
  }

  // Filter out empty lists and compute default weights
  const nonEmptyLists = resultLists.filter(list => list && list.length > 0);
  if (nonEmptyLists.length === 0) {
    return [];
  }

  // Use provided weights or default to all 1s
  const finalWeights = weights || Array(resultLists.length).fill(1);

  // Accumulator: map from text → { text, metadata, score }
  const scoreMap = new Map();

  // Process each list
  for (let i = 0; i < resultLists.length; i++) {
    const list = resultLists[i];
    const weight = finalWeights[i] !== undefined ? finalWeights[i] : 1;

    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const contribution = weight / (k + rank + 1);

      if (scoreMap.has(item.text)) {
        // Item already seen; accumulate score
        const existing = scoreMap.get(item.text);
        existing.score += contribution;
      } else {
        // First time seeing this item; store it
        scoreMap.set(item.text, {
          text: item.text,
          metadata: item.metadata,
          score: contribution,
        });
      }
    }
  }

  // Convert map to sorted array (descending by score)
  const result = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);

  return result;
}
