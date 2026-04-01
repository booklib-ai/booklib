/**
 * Extracts individual principles from a search result chunk.
 * A chunk is typically the content of one XML tag section.
 * Principles are bullet points, numbered items, or paragraphs.
 *
 * @param {string} text - the chunk text
 * @param {object} metadata - chunk metadata (name, type, section, etc.)
 * @returns {Array<{principle: string, context: string, source: string, section: string}>}
 */
export function extractPrinciples(text, metadata = {}) {
  if (!text || typeof text !== 'string') return [];

  const source = metadata.name ?? metadata.title ?? 'unknown';
  const section = metadata.type ?? metadata.originalTag ?? 'content';
  const lines = text.split('\n');

  const principles = [];

  // Strategy 1: Bullet points and numbered items
  let currentPrinciple = null;
  let currentContext = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line — flush current principle
      if (currentPrinciple) {
        principles.push({
          principle: currentPrinciple,
          context: currentContext.join(' ').trim(),
          source,
          section,
        });
        currentPrinciple = null;
        currentContext = [];
      }
      continue;
    }

    // New bullet/numbered item
    const bulletMatch = trimmed.match(/^[-*]\s+\*?\*?(.+?)(\*?\*?\s*[:—–-]\s*(.+))?$/);
    const numberedMatch = trimmed.match(/^\d+\.\s+\*?\*?(.+?)(\*?\*?\s*[:—–-]\s*(.+))?$/);
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)/);

    if (bulletMatch || numberedMatch || boldMatch) {
      // Flush previous
      if (currentPrinciple) {
        principles.push({
          principle: currentPrinciple,
          context: currentContext.join(' ').trim(),
          source,
          section,
        });
      }

      const match = boldMatch || bulletMatch || numberedMatch;
      currentPrinciple = (match[1] ?? '').replace(/\*\*/g, '').trim();
      currentContext = match[3] ? [match[3].trim()] : match[2] ? [match[2].replace(/\*\*/g, '').trim()] : [];
    } else if (currentPrinciple) {
      // Continuation line — add to context
      currentContext.push(trimmed);
    }
  }

  // Flush last
  if (currentPrinciple) {
    principles.push({
      principle: currentPrinciple,
      context: currentContext.join(' ').trim(),
      source,
      section,
    });
  }

  // Strategy 2: If no structured items found, treat the whole chunk as one principle
  if (principles.length === 0 && text.trim().length > 0) {
    // Take first sentence or first 150 chars as the principle
    const firstSentence = text.trim().split(/[.!?]\s/)[0];
    const principle = firstSentence.length > 150 ? firstSentence.slice(0, 147) + '...' : firstSentence;
    principles.push({
      principle,
      context: text.trim().slice(principle.length).trim().slice(0, 200),
      source,
      section,
    });
  }

  return principles;
}

/**
 * Extracts principles from multiple search results.
 * Deduplicates by principle text.
 *
 * @param {Array<{text: string, metadata: object, score: number}>} results
 * @param {number} [maxPrinciples=5] - max total principles to return
 * @returns {Array<{principle: string, context: string, source: string, section: string}>}
 */
export function extractFromResults(results, maxPrinciples = 5) {
  const all = [];
  const seen = new Set();

  for (const result of results) {
    const principles = extractPrinciples(result.text, result.metadata);
    for (const p of principles) {
      const key = p.principle.toLowerCase().slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        all.push(p);
      }
      if (all.length >= maxPrinciples) return all;
    }
  }

  return all;
}
