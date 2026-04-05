import fs from 'node:fs';
import path from 'node:path';

const HEURISTICS = {
  'framework-docs': [
    { pattern: /```[\s\S]*?```/g, weight: 2, name: 'code-blocks' },
    { pattern: /\bimport\s+|require\s*\(/gi, weight: 3, name: 'imports' },
    { pattern: /\b(npm|yarn|pnpm)\s+(install|add|run)/gi, weight: 2, name: 'package-mgr' },
    { pattern: /\b(config|configuration|setup|getting.started)\b/gi, weight: 1, name: 'setup-words' },
  ],
  'api-reference': [
    { pattern: /\b(GET|POST|PUT|DELETE|PATCH)\s+\//gi, weight: 3, name: 'http-methods' },
    { pattern: /\/api\//gi, weight: 2, name: 'api-paths' },
    { pattern: /\b(endpoint|request|response|header|status.code)\b/gi, weight: 1, name: 'api-words' },
    { pattern: /\b(200|201|400|401|403|404|500)\b/g, weight: 1, name: 'status-codes' },
  ],
  'release-notes': [
    { pattern: /^#{1,3}\s*v?\d+\.\d+/gm, weight: 4, name: 'version-headers' },
    { pattern: /\b(breaking|deprecated|removed)\b/gi, weight: 3, name: 'breaking-words' },
    { pattern: /\b(added|fixed|changed|updated)\b/gi, weight: 2, name: 'changelog-words' },
    { pattern: /\bchangelog\b/gi, weight: 2, name: 'changelog-mention' },
  ],
  'spec': [
    { pattern: /\b(requirement|acceptance.criteria|user.story)\b/gi, weight: 4, name: 'spec-terms' },
    { pattern: /\b(shall|must|should)\b/gi, weight: 2, name: 'rfc-modals' },
    { pattern: /given.*when.*then/gi, weight: 4, name: 'gherkin' },
    { pattern: /\b(feature|scenario|priority)\b/gi, weight: 1, name: 'spec-words' },
  ],
  'team-decision': [
    { pattern: /##\s*(Context|Decision|Consequences)/gi, weight: 5, name: 'adr-headers' },
    { pattern: /\bStatus:\s*(Accepted|Proposed|Deprecated)/gi, weight: 4, name: 'adr-status' },
    { pattern: /\b(ADR|architecture.decision)\b/gi, weight: 3, name: 'adr-mention' },
  ],
  'tutorial': [
    { pattern: /\bstep\s+\d+/gi, weight: 3, name: 'step-numbers' },
    { pattern: /^#{1,3}\s*step\s+\d+/gim, weight: 4, name: 'step-headers' },
    { pattern: /\b(first|next|then|finally|let's)\b/gi, weight: 1, name: 'sequence-words' },
  ],
};

/**
 * Detect the source type of a directory by analyzing file contents.
 * Scores each file against keyword/pattern heuristics and picks the highest-scoring type.
 * Falls back to 'wiki' when no type scores above the threshold.
 *
 * @param {string} dirPath - directory to analyze
 * @param {object} [opts]
 * @param {number} [opts.maxFiles=10] - max files to sample
 * @param {number} [opts.minScore=5] - minimum score to beat 'wiki' default
 * @returns {{ type: string, scores: Record<string, number>, confidence: string }}
 */
export function detectSourceType(dirPath, opts = {}) {
  const { maxFiles = 10, minScore = 5 } = opts;

  if (maxFiles < 1) throw new Error('maxFiles must be >= 1');
  if (minScore < 0) throw new Error('minScore must be >= 0');

  let files;
  try {
    files = findMarkdownFiles(dirPath).slice(0, maxFiles);
  } catch {
    return { type: 'wiki', scores: {}, confidence: 'none' };
  }

  if (files.length === 0) {
    return { type: 'wiki', scores: {}, confidence: 'none' };
  }

  const parts = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').trim();
    if (text.length > 0) parts.push(text);
  }
  if (parts.length === 0) {
    return { type: 'wiki', scores: {}, confidence: 'none' };
  }
  const content = parts.join('\n');

  const scores = {};
  for (const [type, rules] of Object.entries(HEURISTICS)) {
    let score = 0;
    for (const rule of rules) {
      const matches = content.match(rule.pattern);
      if (matches) score += matches.length * rule.weight;
    }
    scores[type] = score;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = sorted[0];

  if (bestScore < minScore) {
    return { type: 'wiki', scores, confidence: 'low' };
  }

  const runnerUp = sorted[1]?.[1] ?? 0;
  const confidence = bestScore >= runnerUp * 2 ? 'high' : 'medium';

  return { type: bestType, scores, confidence };
}

/** Recursively find markdown/text files, skipping common noise directories. */
function findMarkdownFiles(dirPath) {
  const results = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.booklib'].includes(entry.name)) {
          walk(full);
        }
      } else if (/\.(md|mdx|txt|rst)$/i.test(entry.name)) {
        results.push(full);
      }
    }
  };
  walk(dirPath);
  return results;
}
