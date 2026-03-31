export const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
  'must', 'can', 'could', 'not', 'no', 'nor', 'so', 'yet', 'both', 'with',
  'about', 'from', 'up', 'down', 'out', 'how', 'what', 'when', 'where',
  'who', 'why', 'which', 'by', 'as', 'if', 'then', 'than', 'too', 'very',
  'just', 'more', 'also', 'its', 'it',
]);

export function extractKeywords(query) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));

  return tokens;
}

export function expandQuery(query) {
  const keywords = extractKeywords(query);

  const expanded = [];

  // Variant 1: keywords joined with spaces
  if (keywords.length > 0) {
    const keywordJoined = keywords.join(' ');
    if (keywordJoined !== query) {
      expanded.push(keywordJoined);
    }
  }

  // Variant 2: "best practices for ${keywords}"
  if (keywords.length > 0) {
    expanded.push(`best practices for ${keywords.join(' ')}`);
  }

  // Variant 3: "how to ${keywords}"
  if (keywords.length > 0) {
    expanded.push(`how to ${keywords.join(' ')}`);
  }

  return {
    original: query,
    keywords,
    expanded,
  };
}
