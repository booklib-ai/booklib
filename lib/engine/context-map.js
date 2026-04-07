// lib/engine/context-map.js — keyword extraction for runtime context injection

/**
 * Stopwords filtered from code terms. Common English words that
 * carry no signal for matching knowledge to source files.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
  'must', 'can', 'could', 'not', 'no', 'nor', 'so', 'yet', 'both', 'with',
  'about', 'from', 'up', 'down', 'out', 'how', 'what', 'when', 'where',
  'who', 'why', 'which', 'by', 'as', 'if', 'then', 'than', 'too', 'very',
  'just', 'more', 'also', 'its', 'it', 'all', 'use', 'that', 'this',
  'each', 'every', 'any', 'some', 'such',
]);

/**
 * Terms that map to file glob patterns. When these appear in
 * knowledge text, they hint which source files the rule applies to.
 */
const TERM_TO_GLOB = {
  api: '**/api/**',
  admin: '**/admin/**',
  auth: '**/auth/**',
  middleware: '**/middleware/**',
  config: '**/config/**',
  migration: '**/migrations/**',
  test: '**/test*/**',
  route: '**/routes/**',
  controller: '**/controllers/**',
  model: '**/models/**',
  service: '**/services/**',
  component: '**/components/**',
  hook: '**/hooks/**',
  util: '**/utils/**',
  helper: '**/helpers/**',
  schema: '**/schema*/**',
  handler: '**/handlers/**',
  worker: '**/workers/**',
  job: '**/jobs/**',
  plugin: '**/plugins/**',
  endpoint: '**/api/**',
};

/**
 * Known packages whose mention in knowledge text signals an import trigger.
 * Checked case-insensitively against words in the text.
 */
const KNOWN_PACKAGES = new Set([
  'stripe', 'express', 'next', 'react', 'supabase', 'prisma',
  'drizzle', 'zod', 'joi', 'lodash', 'axios', 'fastify', 'hono',
  'trpc', 'graphql', 'apollo', 'sequelize', 'mongoose', 'redis',
  'bullmq', 'kafkajs', 'socket.io', 'passport', 'jest', 'vitest',
  'playwright', 'cypress', 'tailwindcss', 'webpack', 'vite', 'esbuild',
  'turborepo', 'pino', 'winston', 'sentry', 'datadog', 'knex',
]);

/** Regex to capture quoted package names like '@scope/pkg' or "pkg-name" */
const QUOTED_PKG_RE = /['"](@[\w-]+\/[\w.-]+|[\w][\w.-]*)['"`]/g;

/**
 * Extract three types of keywords from knowledge text.
 *
 * @param {string} text - knowledge item text (markdown, notes, decisions)
 * @returns {{ codeTerms: string[], filePatterns: string[], importTriggers: string[] }}
 */
export function extractKeywords(text) {
  if (!text) return { codeTerms: [], filePatterns: [], importTriggers: [] };

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/[^a-z0-9@/._-]+/).filter(Boolean);

  const codeTerms = extractCodeTerms(words);
  const filePatterns = extractFilePatterns(words);
  const importTriggers = extractImportTriggers(words, text);

  return { codeTerms, filePatterns, importTriggers };
}

/**
 * Nouns and identifiers: filter stopwords, min 3 chars, deduplicated, lowercased.
 * @param {string[]} words - pre-split lowercased tokens
 * @returns {string[]}
 */
function extractCodeTerms(words) {
  const seen = new Set();
  return words.filter(w => {
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) return false;
    seen.add(w);
    return true;
  });
}

/**
 * Glob patterns inferred from path-like terms in text.
 * @param {string[]} words - pre-split lowercased tokens
 * @returns {string[]}
 */
function extractFilePatterns(words) {
  const patterns = new Set();
  for (const word of words) {
    // Strip trailing 's' for simple plurals (e.g., "endpoints" -> "endpoint")
    const singular = word.endsWith('s') ? word.slice(0, -1) : word;
    const glob = TERM_TO_GLOB[word] ?? TERM_TO_GLOB[singular];
    if (glob) patterns.add(glob);
  }
  return [...patterns];
}

/**
 * Package names found by checking known packages and extracting quoted strings.
 * @param {string[]} words - pre-split lowercased tokens
 * @param {string} rawText - original text for quoted-string extraction
 * @returns {string[]}
 */
function extractImportTriggers(words, rawText) {
  const triggers = new Set();

  for (const word of words) {
    if (KNOWN_PACKAGES.has(word)) triggers.add(word);
  }

  for (const match of rawText.matchAll(QUOTED_PKG_RE)) {
    triggers.add(match[1]);
  }

  return [...triggers];
}

// ── Code block extraction ────────────────────────────────────────────────────

const CODE_BLOCK_RE = /```[\w]*\n([\s\S]*?)```/;

/**
 * Extract the first markdown code block from text.
 * @param {string} text
 * @returns {string | null}
 */
function extractCodeBlock(text) {
  const match = text.match(CODE_BLOCK_RE);
  return match ? match[1].trim() : null;
}

// ── Injection text builder ───────────────────────────────────────────────────

/**
 * Build pre-computed injection text for a knowledge item.
 * For decisions/notes: constraint is first 200 chars, correction is null,
 * and example is extracted from any markdown code block.
 *
 * @param {{ text: string }} item - knowledge item with a .text property
 * @returns {{ correction: null, constraint: string, example: string | null }}
 */
export function buildInjectionText(item) {
  const text = item?.text ?? '';
  return {
    correction: null,
    constraint: text.slice(0, 200),
    example: extractCodeBlock(text),
  };
}
