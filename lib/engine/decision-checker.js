import fs from 'node:fs';
import path from 'node:path';
import { parseImports, detectLanguage } from './import-parser.js';

const MAX_FILE_SIZE = 1_000_000;

/**
 * Prohibition patterns -- regex that captures what's being prohibited.
 * Group 1 should capture the prohibited thing.
 */
const PROHIBITION_PATTERNS = [
  // "do not use X", "don't use X", "never use X", "avoid X"
  /(?:do\s+not|don't|never|avoid)\s+(?:use|using)\s+['"`]?([^'"`.,;\n]+)/gi,
  // "deprecated: X", "X is deprecated"
  /deprecated:?\s+['"`]?([^'"`.,;\n]+)/gi,
  /(['"`]?[A-Z][\w.]*['"`]?)\s+is\s+deprecated/gi,
  // "prefer X over Y" -- Y is prohibited
  /prefer\s+\S+\s+over\s+['"`]?([^'"`.,;\n]+)/gi,
  // "replaced X with Y" -- X is prohibited
  /replaced?\s+['"`]?([^'"`.,;\n]+?)['"`]?\s+with\s/gi,
  // "decided against X"
  /decided\s+against\s+['"`]?([^'"`.,;\n]+)/gi,
  // "instead of X" — only after a decision verb to reduce false positives
  /(?:decided|agreed|chose|chosen|use)\s+\S+\s+instead\s+of\s+['"`]?([^'"`.,;\n]+)/gi,
  // "must not X", "should not X"
  /(?:must|should)\s+not\s+(?:use|import|call|reference)\s+['"`]?([^'"`.,;\n]+)/gi,
];

export class DecisionChecker {
  /**
   * @param {object} [opts]
   * @param {object} [opts.searcher] - BookLibSearcher instance
   * @param {number} [opts.minScore] - minimum search relevance score
   */
  constructor(opts = {}) {
    this.searcher = opts.searcher ?? null;
    this.minScore = opts.minScore ?? 0.4;
  }

  /**
   * Check a file for contradictions against indexed team decisions.
   * @param {string} filePath
   * @returns {Promise<{contradictions: Array<{identifier: string, decision: string, source: string, pattern: string}>, checked: number}>}
   */
  async checkFile(filePath) {
    if (!this.searcher) return { contradictions: [], checked: 0 };

    const language = detectLanguage(filePath);
    if (!language) return { contradictions: [], checked: 0 };

    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved, { throwIfNoEntry: false });
    if (!stat || stat.size > MAX_FILE_SIZE) return { contradictions: [], checked: 0 };

    const code = fs.readFileSync(resolved, 'utf8');
    const identifiers = this._extractIdentifiers(code, language);
    if (identifiers.length === 0) return { contradictions: [], checked: 0 };

    return this._findContradictions(identifiers);
  }

  /**
   * Extract meaningful identifiers from code -- import names, API calls, etc.
   * @param {string} code
   * @param {string} language
   * @returns {string[]} unique identifiers
   */
  _extractIdentifiers(code, language) {
    const imports = parseImports(code, language).map(i => i.module);
    const apiCalls = [];
    // Match dot-notation API calls: stripe.charges.create(), db.collection.find()
    const dotPattern = /\b([a-zA-Z_$][\w]*(?:\.[a-zA-Z_$]\w*)+)\s*\(/g;
    let match;
    while ((match = dotPattern.exec(code)) !== null) {
      apiCalls.push(match[1]);
    }
    return [...new Set([...imports, ...apiCalls])];
  }

  /**
   * Search the index for each identifier and check for contradictions.
   * @param {string[]} identifiers
   * @returns {Promise<{contradictions: Array, checked: number}>}
   */
  async _findContradictions(identifiers) {
    const contradictions = [];
    const seen = new Set();

    for (const id of identifiers) {
      try {
        const results = await this.searcher.search(id, 3, this.minScore);
        for (const result of results) {
          this._checkResult(result, identifiers, seen, contradictions);
        }
      } catch {
        // Search failure -- skip this identifier
      }
    }

    return { contradictions, checked: identifiers.length };
  }

  /**
   * Check a single search result for prohibition matches.
   * @param {object} result - search result with text and metadata
   * @param {string[]} identifiers - code identifiers to match against
   * @param {Set} seen - dedup tracker
   * @param {Array} contradictions - output array
   */
  _checkResult(result, identifiers, seen, contradictions) {
    const text = result.item?.text ?? result.text ?? '';
    const prohibited = this._extractProhibitions(text);

    for (const { target, pattern } of prohibited) {
      const matchedId = this._matchesIdentifier(target, identifiers);
      const key = `${matchedId}:${text.slice(0, 50)}`;
      if (matchedId && !seen.has(key)) {
        seen.add(key);
        contradictions.push({
          identifier: matchedId,
          decision: text.slice(0, 300),
          source: result.metadata?.sourceName ?? result.metadata?.title ?? 'unknown',
          pattern,
        });
      }
    }
  }

  /**
   * Extract prohibition targets from a text snippet.
   * @param {string} text
   * @returns {Array<{target: string, pattern: string}>}
   */
  _extractProhibitions(text) {
    const results = [];
    for (const pattern of PROHIBITION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const target = match[1].trim();
        if (target.length >= 2 && target.length <= 100) {
          results.push({ target, pattern: pattern.source.slice(0, 40) });
        }
      }
    }
    return results;
  }

  /**
   * Check if a prohibition target matches any code identifier.
   * Splits both on word boundaries (dots, spaces) for segment-level matching.
   * "Charges API" matches "stripe.charges" because "charges" overlaps.
   * @param {string} target - the prohibited thing from decision text
   * @param {string[]} identifiers - identifiers from the code
   * @returns {string|null} the matched identifier, or null
   */
  _matchesIdentifier(target, identifiers) {
    const targetSegments = this._toSegments(target);
    for (const id of identifiers) {
      if (this._segmentsOverlap(targetSegments, this._toSegments(id))) {
        return id;
      }
    }
    return null;
  }

  /**
   * Split a string into lowercase segments by dots, spaces, and camelCase.
   * @param {string} str
   * @returns {string[]}
   */
  _toSegments(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[\s./:@-]+/)
      .filter(s => s.length >= 2);
  }

  /**
   * Check if any significant segment from A exactly matches one from B.
   * Exact equality only — substring matching produces too many false positives
   * on short common segments like "api", "sql", "log".
   * @param {string[]} segsA
   * @param {string[]} segsB
   * @returns {boolean}
   */
  _segmentsOverlap(segsA, segsB) {
    const setB = new Set(segsB);
    // Require exact match on segments of 4+ chars, or at least 2 short-segment matches
    let shortMatches = 0;
    for (const a of segsA) {
      if (setB.has(a)) {
        if (a.length >= 4) return true;
        shortMatches++;
        if (shortMatches >= 2) return true;
      }
    }
    return false;
  }
}

export { PROHIBITION_PATTERNS };
