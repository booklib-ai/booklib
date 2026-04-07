// lib/engine/lookup-priority.js — prioritize lookup results by source type

/**
 * Prioritize lookup results: post-training > team > niche skills.
 *
 * @param {{ gapResults?: Array, teamResults?: Array, nicheResults?: Array }} sources
 * @returns {Array} merged results, ordered by priority
 */
export function prioritizeLookupResults({ gapResults = [], teamResults = [], nicheResults = [] }) {
  const priority = [...gapResults, ...teamResults];
  if (priority.length < 2) {
    priority.push(...nicheResults);
  }
  return priority;
}
