// lib/engine/context-map.js — keyword extraction, map building, and matching for runtime context injection

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

// ── Simple glob matching (no external deps) ─────────────────────────────────

/**
 * Convert a file-glob pattern to a regex and test it against a file path.
 * Supports **, *, and ? wildcards.
 *
 * @param {string} pattern - glob pattern (e.g., '** /api/**')
 * @param {string} filePath - file path to test
 * @returns {boolean}
 */
function simpleGlob(pattern, filePath) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\x00/g, '.*');
  return new RegExp(`^${escaped}$`).test(filePath);
}

// ── Match strength constants ────────────────────────────────────────────────

const STRENGTH_IMPORT = 4;
const STRENGTH_FUNCTION = 3;
const STRENGTH_CODE_TERM = 2;
const STRENGTH_FILE_PATTERN = 1;
// Team knowledge needs stronger signal than a single codeTerm match
const MIN_STRENGTH_TEAM = 3; // require file pattern + code term, or function/import match

const MAX_MATCHES = 5;

// ── LLM batch size ──────────────────────────────────────────────────────────

const LLM_BATCH_SIZE = 20;

// ── ContextMapBuilder ───────────────────────────────────────────────────────

export class ContextMapBuilder {
  constructor(opts = {}) {
    this.processingMode = opts.processingMode ?? 'fast';
    this.apiKey = opts.apiKey;
    this.ollamaModel = opts.ollamaModel;
  }

  /**
   * Build a context map from knowledge items.
   * @param {Array<{id: string, text: string, source?: string, type?: string}>} items
   * @returns {Promise<{version: number, builtAt: string, items: Array}>}
   */
  async buildFromKnowledge(items) {
    if (!items?.length) return this._emptyMap();

    const mapped = items.map(item => ({
      id: item.id,
      source: item.source ?? null,
      type: item.type ?? null,
      match: {
        ...extractKeywords(item.text),
        functionPatterns: [],
      },
      injection: buildInjectionText(item),
    }));

    if (this.processingMode !== 'fast') {
      await this._inferScopes(mapped, items);
    }

    return { version: 1, builtAt: new Date().toISOString(), items: mapped };
  }

  /**
   * Build a context map from post-training knowledge gaps.
   * @param {Array<{name: string, version?: string, ecosystem?: string, publishDate?: string}>} gaps
   * @returns {Promise<{version: number, builtAt: string, items: Array}>}
   */
  async buildFromGaps(gaps, opts = {}) {
    if (!gaps?.length) return this._emptyMap();
    const { booklibDir } = opts;

    const mapped = gaps.map(gap => {
      const thinCorrection = `${gap.name}@${gap.version ?? 'latest'} (published ${gap.publishDate ?? 'unknown'}). Post-training.`;

      // Try to enrich correction from resolved docs (Context7/GitHub)
      let richCorrection = thinCorrection;
      if (booklibDir) {
        try {
          const safeName = gap.name.replace(/[@/]/g, '_').replace(/^_+/, '');
          const sourceDirs = [
            join(booklibDir, 'sources', `ctx7-${safeName}`),
            join(booklibDir, 'sources', `gh-${safeName}`),
          ];

          for (const dir of sourceDirs) {
            if (!existsSync(dir)) continue;
            const files = readdirSync(dir).filter(f => f.endsWith('.md'));
            if (files.length === 0) continue;

            const snippets = files.slice(0, 3).map(f => {
              const content = readFileSync(join(dir, f), 'utf8');
              return content.slice(0, 500).trim();
            }).filter(s => s.length > 20);

            if (snippets.length > 0) {
              richCorrection = `${thinCorrection}\n\nResolved docs:\n${snippets.join('\n\n---\n\n')}`;
              break;
            }
          }
        } catch { /* best-effort — fall back to thin correction */ }
      }

      return {
        id: `gap:${gap.name}`,
        source: 'gap-detector',
        type: 'post-training',
        match: {
          codeTerms: [],
          filePatterns: ['**'],
          importTriggers: [gap.name],
          functionPatterns: [],
        },
        injection: {
          correction: richCorrection,
          constraint: null,
          example: null,
        },
      };
    });

    return { version: 1, builtAt: new Date().toISOString(), items: mapped };
  }

  /**
   * Add a single item to an existing context map.
   * @param {{version: number, builtAt: string, items: Array}} map
   * @param {{id: string, text: string, source?: string, type?: string}} item
   * @returns {Promise<{version: number, builtAt: string, items: Array}>}
   */
  async addItem(map, item) {
    const entry = {
      id: item.id,
      source: item.source ?? null,
      type: item.type ?? null,
      match: {
        ...extractKeywords(item.text),
        functionPatterns: [],
      },
      injection: buildInjectionText(item),
    };

    if (this.processingMode !== 'fast') {
      await this._inferScopes([entry], [item]);
    }

    map.items.push(entry);
    return map;
  }

  /**
   * Write a context map to disk as JSON.
   * @param {string} filePath
   * @param {{version: number, builtAt: string, items: Array}} map
   */
  save(filePath, map) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf8');
  }

  /**
   * Load a context map from disk. Returns null if missing or corrupt.
   * @param {string} filePath
   * @returns {{version: number, builtAt: string, items: Array} | null}
   */
  static load(filePath) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /** @returns {{version: number, builtAt: string, items: Array}} */
  _emptyMap() {
    return { version: 1, builtAt: new Date().toISOString(), items: [] };
  }

  /**
   * Batch LLM inference to populate functionPatterns and importTriggers.
   * Processes items in batches of LLM_BATCH_SIZE.
   */
  async _inferScopes(mapped, sourceItems) {
    for (let i = 0; i < mapped.length; i += LLM_BATCH_SIZE) {
      const batchMapped = mapped.slice(i, i + LLM_BATCH_SIZE);
      const batchSource = sourceItems.slice(i, i + LLM_BATCH_SIZE);

      const prompt = this._buildScopePrompt(batchSource);
      const response = await this._callLLM(prompt);
      this._applyScopeResponse(batchMapped, response);
    }
  }

  /**
   * Build a prompt asking the LLM for functionPatterns and importTriggers.
   * @param {Array<{id: string, text: string}>} items
   * @returns {string}
   */
  _buildScopePrompt(items) {
    const itemList = items
      .map((it, idx) => `[${idx}] id="${it.id}": ${it.text.slice(0, 300)}`)
      .join('\n');

    return [
      'For each knowledge item below, return JSON: an array of objects with',
      '{ "index": number, "functionPatterns": string[], "importTriggers": string[] }.',
      'functionPatterns: regex patterns for function/method names this rule applies to.',
      'importTriggers: npm/pip package names that signal this rule is relevant.',
      'Return ONLY valid JSON array, no markdown fences.',
      '',
      itemList,
    ].join('\n');
  }

  /**
   * Parse LLM response and merge functionPatterns/importTriggers into mapped items.
   */
  _applyScopeResponse(mapped, response) {
    if (!response) return;

    try {
      const cleaned = response.replace(/```[\w]*\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return;

      for (const entry of parsed) {
        const target = mapped[entry.index];
        if (!target) continue;
        if (Array.isArray(entry.functionPatterns)) {
          target.match.functionPatterns = entry.functionPatterns;
        }
        if (Array.isArray(entry.importTriggers)) {
          const merged = new Set([...target.match.importTriggers, ...entry.importTriggers]);
          target.match.importTriggers = [...merged];
        }
      }
    } catch {
      // LLM returned unparseable response; skip gracefully
    }
  }

  /**
   * Call the configured LLM. Override this method in tests.
   * @param {string} prompt
   * @returns {Promise<string | null>}
   */
  async _callLLM(prompt) {
    const mode = this.processingMode;

    if (mode === 'api' && this.apiKey) {
      return this._callApiLLM(prompt);
    }
    if (mode === 'local') {
      return this._callOllamaLLM(prompt);
    }
    return null;
  }

  /** Call Anthropic or OpenAI API based on key prefix. */
  async _callApiLLM(prompt) {
    const isAnthropic = this.apiKey.startsWith('sk-ant-');
    const url = isAnthropic
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions';

    const body = isAnthropic
      ? { model: 'claude-sonnet-4-20250514', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }
      : { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 2048 };

    const headers = isAnthropic
      ? { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` };

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) return null;

    const data = await res.json();
    return isAnthropic ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
  }

  /** Call local Ollama instance. */
  async _callOllamaLLM(prompt) {
    const model = this.ollamaModel ?? 'llama3';
    const url = 'http://localhost:11434/api/generate';
    const body = { model, prompt, stream: false };

    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) return null;
      const data = await res.json();
      return data.response ?? null;
    } catch {
      return null;
    }
  }
}

// ── ContextMapMatcher ───────────────────────────────────────────────────────

/** Prohibition patterns for contradiction checking. */
const PROHIBITION_RE = /(?:do not use|don't use|never use|avoid|deprecated|prefer\s+(\S+)\s+over)\s+(\S+)/gi;

export class ContextMapMatcher {
  /**
   * @param {Array} items - items from a loaded context map
   */
  constructor(items) {
    this.items = items ?? [];
  }

  /**
   * Match context map items against a file path, code block, and imports.
   * Returns matched items sorted by strength (desc), capped at MAX_MATCHES.
   *
   * @param {string} filePath - current file being edited
   * @param {string} codeBlock - code content
   * @param {string[]} imports - imported package names
   * @returns {Array} matched items with _strength property
   */
  match(filePath, codeBlock, imports) {
    const importSet = new Set((imports ?? []).map(i => i.toLowerCase()));
    const codeLower = (codeBlock ?? '').toLowerCase();

    const scored = [];
    for (const item of this.items) {
      const strength = this._scoreItem(item, filePath, codeLower, importSet);
      // Post-training items: any match is enough (import trigger required by the check below)
      // Team knowledge: require stronger signal to avoid broad keyword noise
      const minStrength = item.type === 'post-training' ? 1 : MIN_STRENGTH_TEAM;
      if (strength >= minStrength) scored.push({ ...item, _strength: strength });
    }

    scored.sort((a, b) => b._strength - a._strength);
    return scored.slice(0, MAX_MATCHES);
  }

  /**
   * Check for contradictions between new code and matched knowledge items.
   * @param {string} newCode - code being written
   * @param {Array} matchedItems - items returned by match()
   * @returns {Array<{id: string, constraint: string, example: string | null, source: string | null}>}
   */
  checkContradictions(newCode, matchedItems) {
    if (!newCode || !matchedItems?.length) return [];

    const codeLower = newCode.toLowerCase();
    const violations = [];

    for (const item of matchedItems) {
      const text = item.injection?.constraint ?? '';
      const found = this._findProhibitions(text, codeLower);
      if (found.length > 0) {
        violations.push({
          id: item.id,
          constraint: found.join('; '),
          example: item.injection?.example ?? null,
          source: item.source ?? null,
        });
      }
    }

    return violations;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Score a single item against the current context.
   * Post-training items with '**' filePattern require importTriggers to match.
   */
  _scoreItem(item, filePath, codeLower, importSet) {
    let strength = 0;

    const m = item.match ?? {};
    const importMatch = this._matchImports(m.importTriggers, importSet);
    if (importMatch) strength += STRENGTH_IMPORT;

    const fnMatch = this._matchFunctionPatterns(m.functionPatterns, codeLower);
    if (fnMatch) strength += STRENGTH_FUNCTION;

    const termMatch = this._matchCodeTerms(m.codeTerms, codeLower);
    if (termMatch) strength += STRENGTH_CODE_TERM;

    const fileMatch = this._matchFilePatterns(m.filePatterns, filePath);
    if (fileMatch) strength += STRENGTH_FILE_PATTERN;

    // Post-training items with only '**' glob must have importTriggers match
    if (item.type === 'post-training' && this._hasOnlyWildcard(m.filePatterns) && !importMatch) {
      return 0;
    }

    return strength;
  }

  /** Check if any importTrigger matches the import set. */
  _matchImports(triggers, importSet) {
    if (!triggers?.length) return false;
    return triggers.some(t => {
      const tLower = t.toLowerCase();
      // Exact match: "next" === "next"
      if (importSet.has(tLower)) return true;
      // Subpath match: trigger "next" matches import "next/navigation"
      for (const imp of importSet) {
        if (imp.startsWith(tLower + '/')) return true;
      }
      return false;
    });
  }

  /** Check if any functionPattern regex matches the code. */
  _matchFunctionPatterns(patterns, codeLower) {
    if (!patterns?.length) return false;
    return patterns.some(p => {
      try {
        return new RegExp(p, 'i').test(codeLower);
      } catch {
        return false;
      }
    });
  }

  /** Check if any code term appears in the code block. */
  _matchCodeTerms(terms, codeLower) {
    if (!terms?.length) return false;
    return terms.some(t => codeLower.includes(t.toLowerCase()));
  }

  /** Check if any file pattern matches the file path. */
  _matchFilePatterns(patterns, filePath) {
    if (!patterns?.length || !filePath) return false;
    return patterns.some(p => simpleGlob(p, filePath));
  }

  /** True when filePatterns is exactly ['**'] or empty. */
  _hasOnlyWildcard(patterns) {
    if (!patterns?.length) return true;
    return patterns.length === 1 && patterns[0] === '**';
  }

  /** Extract prohibition patterns and check if code violates them. */
  _findProhibitions(constraintText, codeLower) {
    const violations = [];
    PROHIBITION_RE.lastIndex = 0;

    let match;
    while ((match = PROHIBITION_RE.exec(constraintText)) !== null) {
      // match[1] = preferred term (from "prefer X over Y"), match[2] = prohibited term
      const prohibited = (match[2] ?? '').toLowerCase().replace(/[.,;:!?]/g, '');
      if (prohibited && codeLower.includes(prohibited)) {
        violations.push(match[0].trim());
      }
    }

    return violations;
  }
}
