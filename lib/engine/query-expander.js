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

  if (keywords.length > 0) {
    const keywordJoined = keywords.join(' ');
    const candidates = [
      keywordJoined,
      `best practices for ${keywordJoined}`,
      `how to ${keywordJoined}`,
    ];
    for (const v of candidates) {
      if (v !== query) expanded.push(v);
    }
  }

  return {
    original: query,
    keywords,
    expanded,
  };
}
