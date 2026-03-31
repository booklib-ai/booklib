import fs from 'node:fs';

const K1 = 1.5;
const B = 0.75;
const MIN_TOKEN_LENGTH = 2;

/**
 * Tokenizes text into lowercase alphanumeric terms of at least 2 characters.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Counts term frequencies in a token array.
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function countTermFrequencies(tokens) {
  const freq = new Map();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

/**
 * Computes BM25 IDF for a term.
 * Formula: log((N - df + 0.5) / (df + 0.5) + 1)
 * @param {number} docCount - Total number of documents
 * @param {number} docFrequency - Number of documents containing the term
 * @returns {number}
 */
function computeIdf(docCount, docFrequency) {
  return Math.log((docCount - docFrequency + 0.5) / (docFrequency + 0.5) + 1);
}

/**
 * Scores a single document against a set of query terms using BM25.
 * @param {Object} doc - Document with freq map and len
 * @param {string[]} queryTerms
 * @param {Map<string, number>} df - Document frequency map
 * @param {number} docCount
 * @param {number} avgDocLen
 * @returns {number}
 */
function scoreBm25(doc, queryTerms, df, docCount, avgDocLen) {
  let score = 0;
  for (const term of queryTerms) {
    const termFreq = doc.freq[term] ?? 0;
    if (termFreq === 0) continue;

    const docFrequency = df[term] ?? 0;
    const idf = computeIdf(docCount, docFrequency);
    const normalizedTf =
      (termFreq * (K1 + 1)) /
      (termFreq + K1 * (1 - B + B * (doc.len / avgDocLen)));

    score += idf * normalizedTf;
  }
  return score;
}

/**
 * BM25 full-text search index.
 *
 * Supports incremental document addition, JSON persistence, and
 * Robertson BM25 ranking.
 */
export class BM25Index {
  constructor() {
    this._docs = [];
    this._df = {};
    this._avgLen = 0;
    this._totalLen = 0;
  }

  /**
   * Builds the index from scratch from an array of chunks.
   * @param {{ text: string, metadata: object }[]} chunks
   */
  build(chunks) {
    this._docs = [];
    this._df = {};
    this._avgLen = 0;
    this._totalLen = 0;

    for (const chunk of chunks) {
      this._appendDoc(chunk);
    }
  }

  /**
   * Incrementally adds one document to the index, updating avgLen and df.
   * @param {{ text: string, metadata: object }} chunk
   */
  add(chunk) {
    this._appendDoc(chunk);
  }

  /**
   * Searches the index and returns top-K results sorted by score descending.
   * @param {string} query
   * @param {number} topK
   * @returns {{ score: number, text: string, metadata: object }[]}
   */
  search(query, topK = 20) {
    if (this._docs.length === 0) return [];

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const scoredDocs = this._docs.map(doc => ({
      score: scoreBm25(doc, queryTerms, this._df, this._docs.length, this._avgLen),
      text: doc.text,
      metadata: doc.metadata,
    }));

    const matchingDocs = scoredDocs.filter(r => r.score > 0);
    return matchingDocs
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Persists the index to a JSON file.
   * @param {string} filePath
   */
  save(filePath) {
    const serialized = JSON.stringify({
      docs: this._docs,
      df: this._df,
      avgLen: this._avgLen,
    });
    fs.writeFileSync(filePath, serialized, 'utf8');
  }

  /**
   * Restores a BM25Index instance from a JSON file.
   * @param {string} filePath
   * @returns {BM25Index}
   */
  static load(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { docs, df, avgLen } = JSON.parse(raw);
    const idx = new BM25Index();
    idx._docs = docs;
    idx._df = df;
    idx._avgLen = avgLen;
    idx._totalLen = docs.reduce((sum, d) => sum + d.len, 0);
    return idx;
  }

  /**
   * Internal: adds one document and updates df and avgLen.
   * @param {{ text: string, metadata: object }} chunk
   */
  _appendDoc(chunk) {
    const tokens = tokenize(chunk.text);
    const freqMap = countTermFrequencies(tokens);
    const freqObj = Object.fromEntries(freqMap);

    for (const term of freqMap.keys()) {
      this._df[term] = (this._df[term] ?? 0) + 1;
    }

    const len = tokens.length;
    this._docs.push({ text: chunk.text, metadata: chunk.metadata, freq: freqObj, len });

    this._totalLen += len;
    this._avgLen = this._totalLen / this._docs.length;
  }
}
