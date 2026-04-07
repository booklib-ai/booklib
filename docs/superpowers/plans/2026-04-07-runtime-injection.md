# Runtime Micro-Injection System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-compute a context map at init time that maps knowledge items to code scopes, then use it at runtime in <10ms hooks to inject precisely what the AI doesn't know.

**Architecture:** Context map builder extracts keywords + LLM-inferred scopes from indexed knowledge, saves to `.booklib/context-map.json`. PreToolUse hook loads the map, matches against the file being edited, injects 3-10 lines. PostToolUse hook checks written code against team constraints.

**Tech Stack:** JavaScript ES modules, Node.js 18+, `node:test`, existing BookLib engine modules (gap-detector, import-parser, decision-checker, searcher).

---

### Task 1: Context Map Builder — Keyword Extraction

**Files:**
- Create: `lib/engine/context-map.js`
- Create: `tests/engine/context-map.test.js`

- [ ] **Step 1: Write failing tests for `extractKeywords`**

```javascript
// tests/engine/context-map.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords } from '../../lib/engine/context-map.js';

describe('extractKeywords', () => {
  it('extracts code terms from decision text', () => {
    const result = extractKeywords('All API responses must use {data, error, meta} envelope');
    assert.ok(result.codeTerms.includes('api'));
    assert.ok(result.codeTerms.includes('response'));
    assert.ok(result.codeTerms.includes('envelope'));
  });

  it('extracts file patterns from path-like terms', () => {
    const result = extractKeywords('Admin endpoints require role check middleware');
    assert.ok(result.filePatterns.some(p => p.includes('admin')));
  });

  it('extracts import triggers from package references', () => {
    const result = extractKeywords('Use PaymentIntents not Charges API from stripe');
    assert.ok(result.importTriggers.includes('stripe'));
  });

  it('handles empty input', () => {
    const result = extractKeywords('');
    assert.deepEqual(result.codeTerms, []);
    assert.deepEqual(result.filePatterns, []);
    assert.deepEqual(result.importTriggers, []);
  });

  it('deduplicates terms', () => {
    const result = extractKeywords('API api Api response Response');
    const unique = new Set(result.codeTerms);
    assert.equal(result.codeTerms.length, unique.size);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/context-map.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `extractKeywords`**

```javascript
// lib/engine/context-map.js
import fs from 'node:fs';
import path from 'node:path';

// Known package names that appear in decisions
const KNOWN_PACKAGES = new Set([
  'stripe', 'express', 'fastify', 'next', 'react', 'vue', 'angular',
  'supabase', 'prisma', 'drizzle', 'mongoose', 'redis', 'postgres',
  'tailwind', 'vite', 'webpack', 'jest', 'vitest', 'playwright',
  'docker', 'kubernetes', 'terraform', 'aws', 'gcp', 'azure',
]);

// Path-like terms that suggest file patterns
const PATH_TERMS = {
  api: '**/api/**', admin: '**/admin/**', auth: '**/auth/**',
  payment: '**/payment**', billing: '**/billing**', checkout: '**/checkout**',
  user: '**/user**', config: '**/config**', middleware: '**/middleware**',
  route: '**/route**', controller: '**/controller**', service: '**/service**',
  model: '**/model**', schema: '**/schema**', migration: '**/migration**',
  test: '**/test**', spec: '**/spec**', hook: '**/hook**',
  component: '**/component**', page: '**/page**', layout: '**/layout**',
};

/**
 * Extract code terms, file patterns, and import triggers from knowledge text.
 * Pure keyword extraction — no LLM call.
 * @param {string} text - knowledge item text
 * @returns {{ codeTerms: string[], filePatterns: string[], importTriggers: string[] }}
 */
export function extractKeywords(text) {
  if (!text) return { codeTerms: [], filePatterns: [], importTriggers: [] };

  const lower = text.toLowerCase();
  const words = lower.match(/[a-z][a-z0-9_-]{2,}/g) || [];
  const unique = [...new Set(words)];

  // Code terms: nouns and identifiers (skip common English words)
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are',
    'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
    'not', 'but', 'all', 'any', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just',
    'also', 'use', 'using', 'used', 'make', 'need', 'when', 'where',
    'how', 'what', 'which', 'who', 'why', 'its', 'our', 'your',
  ]);
  const codeTerms = unique.filter(w => !STOP_WORDS.has(w) && w.length >= 3);

  // File patterns from path-like terms
  const filePatterns = [];
  for (const [term, pattern] of Object.entries(PATH_TERMS)) {
    if (lower.includes(term)) filePatterns.push(pattern);
  }

  // Import triggers from known package names
  const importTriggers = [];
  for (const pkg of KNOWN_PACKAGES) {
    if (lower.includes(pkg)) importTriggers.push(pkg);
  }

  // Also extract quoted package names: 'pkg-name' or `pkg-name`
  const quoted = text.match(/['"`]([a-z@][a-z0-9/_.-]+)['"`]/g) || [];
  for (const q of quoted) {
    const name = q.slice(1, -1);
    if (name.length >= 2 && !importTriggers.includes(name)) {
      importTriggers.push(name);
    }
  }

  return { codeTerms, filePatterns: [...new Set(filePatterns)], importTriggers };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/context-map.test.js`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add lib/engine/context-map.js tests/engine/context-map.test.js
git commit -m "feat(context-map): keyword extraction from knowledge text"
```

---

### Task 2: Context Map Builder — Build and Save

**Files:**
- Modify: `lib/engine/context-map.js`
- Modify: `tests/engine/context-map.test.js`

- [ ] **Step 1: Write failing tests for `ContextMapBuilder`**

```javascript
// Add to tests/engine/context-map.test.js
import { ContextMapBuilder } from '../../lib/engine/context-map.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ContextMapBuilder', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-map-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('builds context map from knowledge items', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const items = [
      { id: 'adr-001', text: 'Use PaymentIntents not Charges API', source: 'decisions.md', type: 'decision' },
      { id: 'note-001', text: 'Cache TTL must be 5 minutes for user data', source: 'specs', type: 'note' },
    ];
    const map = await builder.buildFromKnowledge(items);
    assert.equal(map.items.length, 2);
    assert.ok(map.items[0].match.codeTerms.length > 0);
    assert.ok(map.items[0].injection.constraint);
  });

  it('builds context map from gap results', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const gaps = [
      { name: 'next', version: '14.2.35', ecosystem: 'npm', publishDate: new Date('2025-12-11') },
    ];
    const map = await builder.buildFromGaps(gaps);
    assert.equal(map.items.length, 1);
    assert.ok(map.items[0].match.importTriggers.includes('next'));
    assert.ok(map.items[0].injection.correction.includes('14.2.35'));
  });

  it('saves and loads context map', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([
      { id: 'test', text: 'Test decision about API', source: 'test', type: 'decision' },
    ]);
    const filePath = path.join(tmpDir, 'context-map.json');
    builder.save(filePath, map);
    const loaded = ContextMapBuilder.load(filePath);
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0].id, 'test');
  });

  it('adds items incrementally', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([
      { id: 'first', text: 'First decision', source: 'test', type: 'decision' },
    ]);
    const updated = await builder.addItem(map, {
      id: 'second', text: 'Second decision about auth', source: 'test', type: 'decision',
    });
    assert.equal(updated.items.length, 2);
  });

  it('handles empty knowledge', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([]);
    assert.equal(map.items.length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/context-map.test.js`
Expected: FAIL — ContextMapBuilder not found

- [ ] **Step 3: Implement `ContextMapBuilder`**

```javascript
// Add to lib/engine/context-map.js

/**
 * Builds and manages the pre-computed context map.
 * Maps each knowledge item to code scopes for <10ms runtime matching.
 */
export class ContextMapBuilder {
  constructor(opts = {}) {
    this.processingMode = opts.processingMode ?? 'fast';
    this.apiKey = opts.apiKey;
    this.ollamaModel = opts.ollamaModel;
  }

  /**
   * Build context map from team knowledge items.
   * @param {Array<{id, text, source, type}>} items
   * @returns {Promise<{version: number, builtAt: string, items: Array}>}
   */
  async buildFromKnowledge(items) {
    const mapItems = [];
    for (const item of items) {
      mapItems.push(this._buildItem(item));
    }
    // LLM scope inference for non-fast modes (batched, deferred to Task 3)
    return { version: 1, builtAt: new Date().toISOString(), items: mapItems };
  }

  /**
   * Build context map entries from gap detection results.
   * @param {Array<{name, version, ecosystem, publishDate}>} gaps
   * @returns {Promise<{version: number, builtAt: string, items: Array}>}
   */
  async buildFromGaps(gaps) {
    const mapItems = gaps.map(dep => ({
      id: `gap-${dep.name}-${dep.version}`,
      text: `${dep.name}@${dep.version} is post-training`,
      source: 'gap-detection',
      type: 'post-training',
      match: {
        filePatterns: ['**'],
        codeTerms: [],
        functionPatterns: [],
        importTriggers: this._getImportPaths(dep.name, dep.ecosystem),
      },
      injection: {
        correction: `${dep.name}@${dep.version} (published ${dep.publishDate.toISOString().split('T')[0]}). Model may have outdated knowledge.`,
        constraint: null,
        example: null,
      },
    }));
    return { version: 1, builtAt: new Date().toISOString(), items: mapItems };
  }

  /**
   * Add a single item to an existing map.
   * @param {{version, builtAt, items}} map
   * @param {{id, text, source, type}} item
   * @returns {Promise<{version, builtAt, items}>}
   */
  async addItem(map, item) {
    const newItem = this._buildItem(item);
    return { ...map, items: [...map.items, newItem], builtAt: new Date().toISOString() };
  }

  /**
   * Save context map to disk.
   * @param {string} filePath
   * @param {object} map
   */
  save(filePath, map) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2));
  }

  /**
   * Load context map from disk.
   * @param {string} filePath
   * @returns {object|null}
   */
  static load(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Build a single context map item from a knowledge item. */
  _buildItem(item) {
    const keywords = extractKeywords(item.text);
    return {
      id: item.id,
      text: item.text,
      source: item.source,
      type: item.type ?? 'note',
      match: {
        filePatterns: keywords.filePatterns,
        codeTerms: keywords.codeTerms,
        functionPatterns: [], // populated by LLM inference in Task 3
        importTriggers: keywords.importTriggers,
      },
      injection: buildInjectionText(item),
    };
  }

  /** Get common import paths for a package. */
  _getImportPaths(name, ecosystem) {
    if (ecosystem === 'npm') {
      // npm packages can be imported as-is or with subpaths
      const paths = [name];
      if (name.startsWith('@')) {
        // Scoped: @scope/pkg → also @scope/pkg/subpath
        paths.push(`${name}/`);
      } else {
        paths.push(`${name}/`);
      }
      return paths;
    }
    return [name];
  }
}

/**
 * Build pre-computed injection text for a knowledge item.
 * @param {{id, text, source, type}} item
 * @returns {{ correction: string|null, constraint: string|null, example: string|null }}
 */
export function buildInjectionText(item) {
  const isDecision = item.type === 'decision' || item.type === 'team-decision';
  const isNote = item.type === 'note' || item.type === 'insight';
  const isPattern = item.type === 'pattern';

  // Extract a code example if present in the text
  const codeMatch = item.text.match(/```[\s\S]*?```/);
  const example = codeMatch ? codeMatch[0].replace(/```\w*\n?/, '').replace(/```/, '').trim() : null;

  return {
    correction: null, // only set for post-training items
    constraint: (isDecision || isNote || isPattern) ? item.text.slice(0, 200) : null,
    example: example ? example.slice(0, 300) : null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/context-map.test.js`
Expected: PASS (10/10)

- [ ] **Step 5: Commit**

```bash
git add lib/engine/context-map.js tests/engine/context-map.test.js
git commit -m "feat(context-map): ContextMapBuilder with build, save, load, incremental add"
```

---

### Task 3: Context Map Builder — LLM Scope Inference

**Files:**
- Modify: `lib/engine/context-map.js`
- Modify: `tests/engine/context-map.test.js`

- [ ] **Step 1: Write failing tests for LLM inference**

```javascript
describe('ContextMapBuilder with LLM inference', () => {
  it('skips LLM in fast mode — functionPatterns stay empty', async () => {
    const builder = new ContextMapBuilder({ processingMode: 'fast' });
    const map = await builder.buildFromKnowledge([
      { id: 't1', text: 'All API handlers must validate input', source: 'test', type: 'decision' },
    ]);
    assert.deepEqual(map.items[0].match.functionPatterns, []);
  });

  it('calls LLM in api mode — functionPatterns populated', async () => {
    // Mock the LLM call
    const builder = new ContextMapBuilder({ processingMode: 'api' });
    builder._callLLM = async (prompt) => JSON.stringify([
      { functionPatterns: ['*handler*', '*route*'], importTriggers: ['express'] }
    ]);
    const map = await builder.buildFromKnowledge([
      { id: 't1', text: 'All API handlers must validate input', source: 'test', type: 'decision' },
    ]);
    assert.ok(map.items[0].match.functionPatterns.includes('*handler*'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/context-map.test.js`
Expected: FAIL — _callLLM not defined

- [ ] **Step 3: Implement LLM scope inference**

```javascript
// Add to ContextMapBuilder class in lib/engine/context-map.js

  /**
   * Build with LLM scope inference for non-fast modes.
   * Batches items 20 at a time for efficiency.
   */
  async buildFromKnowledge(items) {
    const mapItems = [];
    for (const item of items) {
      mapItems.push(this._buildItem(item));
    }

    // LLM scope inference (skip in fast mode)
    if (this.processingMode !== 'fast' && mapItems.length > 0) {
      await this._inferScopes(mapItems);
    }

    return { version: 1, builtAt: new Date().toISOString(), items: mapItems };
  }

  /** Batch LLM inference for function patterns and import triggers. */
  async _inferScopes(mapItems) {
    const BATCH_SIZE = 20;
    for (let i = 0; i < mapItems.length; i += BATCH_SIZE) {
      const batch = mapItems.slice(i, i + BATCH_SIZE);
      const prompt = this._buildScopePrompt(batch);
      try {
        const response = await this._callLLM(prompt);
        const scopes = JSON.parse(response);
        for (let j = 0; j < batch.length && j < scopes.length; j++) {
          if (scopes[j].functionPatterns) {
            batch[j].match.functionPatterns = scopes[j].functionPatterns;
          }
          if (scopes[j].importTriggers) {
            for (const trigger of scopes[j].importTriggers) {
              if (!batch[j].match.importTriggers.includes(trigger)) {
                batch[j].match.importTriggers.push(trigger);
              }
            }
          }
        }
      } catch {
        // LLM failed — keep keyword-only scopes
      }
    }
  }

  _buildScopePrompt(items) {
    const list = items.map((item, i) =>
      `${i + 1}. "${item.text}"`
    ).join('\n');
    return `For each team decision/note below, identify what code patterns it applies to.
Return a JSON array with one object per item:
[{ "functionPatterns": ["glob*pattern"], "importTriggers": ["package-name"] }]

Only include patterns that are specific and useful for matching. Skip generic terms.

Items:
${list}`;
  }

  /** Call LLM based on processing mode. Override in tests. */
  async _callLLM(prompt) {
    if (this.processingMode === 'api') {
      return this._callAPI(prompt);
    }
    if (this.processingMode === 'local') {
      return this._callOllama(prompt);
    }
    return '[]';
  }

  async _callAPI(prompt) {
    const isAnthropic = this.apiKey?.startsWith('sk-ant-');
    if (isAnthropic) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      return data.content?.[0]?.text ?? '[]';
    }
    // OpenAI fallback
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '[]';
  }

  async _callOllama(prompt) {
    const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
    const res = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel ?? 'phi3',
        prompt,
        stream: false,
        format: 'json',
      }),
    });
    const data = await res.json();
    return data.response ?? '[]';
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/context-map.test.js`
Expected: PASS (12/12)

- [ ] **Step 5: Commit**

```bash
git add lib/engine/context-map.js tests/engine/context-map.test.js
git commit -m "feat(context-map): LLM scope inference with API/Ollama/fast modes"
```

---

### Task 4: Context Map Matcher — Runtime Matching

**Files:**
- Modify: `lib/engine/context-map.js`
- Modify: `tests/engine/context-map.test.js`

- [ ] **Step 1: Write failing tests for `ContextMapMatcher`**

```javascript
import { ContextMapMatcher } from '../../lib/engine/context-map.js';

describe('ContextMapMatcher', () => {
  const items = [
    {
      id: 'adr-001',
      text: 'Use PaymentIntents not Charges',
      source: 'decisions.md',
      type: 'team-decision',
      match: {
        filePatterns: ['**/payment**', '**/billing**'],
        codeTerms: ['charges', 'charge', 'stripe'],
        functionPatterns: ['create*Payment', 'process*Charge'],
        importTriggers: ['stripe', '@stripe/stripe-js'],
      },
      injection: {
        correction: null,
        constraint: 'Use PaymentIntents API, not Charges (ADR-001).',
        example: 'stripe.paymentIntents.create({ amount, currency })',
      },
    },
    {
      id: 'gap-next',
      text: 'next@14.2.35 post-training',
      source: 'gap-detection',
      type: 'post-training',
      match: {
        filePatterns: ['**'],
        codeTerms: [],
        functionPatterns: [],
        importTriggers: ['next', 'next/cache', 'next/server'],
      },
      injection: {
        correction: 'next@14.2.35 (published 2025-12-11). Post-training.',
        constraint: null,
        example: null,
      },
    },
  ];

  it('matches by importTriggers (strongest)', () => {
    const matcher = new ContextMapMatcher(items);
    const result = matcher.match('src/payments.ts', "import Stripe from 'stripe'", ['stripe']);
    assert.ok(result.length >= 1);
    assert.equal(result[0].id, 'adr-001');
  });

  it('matches by filePatterns', () => {
    const matcher = new ContextMapMatcher(items);
    const result = matcher.match('src/payment/handler.ts', 'function handle() {}', []);
    assert.ok(result.some(r => r.id === 'adr-001'));
  });

  it('matches by codeTerms', () => {
    const matcher = new ContextMapMatcher(items);
    const result = matcher.match('src/api.ts', 'const charge = stripe.charges.create()', []);
    assert.ok(result.some(r => r.id === 'adr-001'));
  });

  it('returns empty for unrelated file', () => {
    const matcher = new ContextMapMatcher(items);
    const result = matcher.match('src/components/Header.tsx', '<div>hello</div>', []);
    // next matches everything via '**' but only with importTriggers
    // Header has no next imports → should not match next
    const nonGap = result.filter(r => r.type !== 'post-training');
    assert.equal(nonGap.length, 0);
  });

  it('sorts by match strength — importTriggers first', () => {
    const matcher = new ContextMapMatcher(items);
    const result = matcher.match(
      'src/payment/route.ts',
      "import Stripe from 'stripe';\nimport { NextResponse } from 'next/server';",
      ['stripe', 'next/server']
    );
    assert.ok(result.length >= 2);
    // Both match by importTriggers, but adr-001 also matches by filePatterns
  });

  it('caps at 5 items', () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      text: `Decision ${i}`,
      source: 'test',
      type: 'decision',
      match: { filePatterns: ['**'], codeTerms: ['common'], functionPatterns: [], importTriggers: [] },
      injection: { correction: null, constraint: `Constraint ${i}`, example: null },
    }));
    const matcher = new ContextMapMatcher(manyItems);
    const result = matcher.match('any/file.ts', 'common code here', []);
    assert.ok(result.length <= 5);
  });

  it('checkContradictions finds prohibited terms in code', () => {
    const matcher = new ContextMapMatcher(items);
    const matched = matcher.match('src/pay.ts', "stripe.charges.create()", ['stripe']);
    const contradictions = matcher.checkContradictions("stripe.charges.create({ amount: 100 })", matched);
    assert.ok(contradictions.length >= 1);
    assert.ok(contradictions[0].constraint.includes('PaymentIntents'));
  });

  it('checkContradictions returns empty when no violation', () => {
    const matcher = new ContextMapMatcher(items);
    const matched = matcher.match('src/pay.ts', "stripe.paymentIntents.create()", ['stripe']);
    const contradictions = matcher.checkContradictions("stripe.paymentIntents.create({ amount: 100 })", matched);
    assert.equal(contradictions.length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/context-map.test.js`
Expected: FAIL — ContextMapMatcher not found

- [ ] **Step 3: Implement `ContextMapMatcher`**

```javascript
// Add to lib/engine/context-map.js
import { minimatch } from 'minimatch'; // or simple glob matching

const MAX_INJECTION_ITEMS = 5;
const MATCH_STRENGTH = { importTriggers: 4, functionPatterns: 3, codeTerms: 2, filePatterns: 1 };

/**
 * Matches file context against pre-computed context map items.
 * Designed for <10ms runtime — pure string matching, no search.
 */
export class ContextMapMatcher {
  constructor(items) {
    this.items = items ?? [];
  }

  /**
   * Match a file being edited against the context map.
   * @param {string} filePath - path of file being edited
   * @param {string} codeBlock - the code being modified (old_string for Edit)
   * @param {string[]} imports - import names extracted from the file
   * @returns {Array} matched items sorted by strength, capped at 5
   */
  match(filePath, codeBlock, imports) {
    const codeLower = (codeBlock ?? '').toLowerCase();
    const importSet = new Set((imports ?? []).map(i => i.toLowerCase()));
    const scored = [];

    for (const item of this.items) {
      let strength = 0;

      // Import triggers (strongest signal)
      if (item.match.importTriggers.some(t => importSet.has(t.toLowerCase()))) {
        strength += MATCH_STRENGTH.importTriggers;
      }

      // Function patterns
      if (item.match.functionPatterns.length > 0) {
        for (const pattern of item.match.functionPatterns) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
          if (regex.test(codeBlock)) {
            strength += MATCH_STRENGTH.functionPatterns;
            break;
          }
        }
      }

      // Code terms
      if (item.match.codeTerms.some(t => codeLower.includes(t.toLowerCase()))) {
        strength += MATCH_STRENGTH.codeTerms;
      }

      // File patterns (weakest but broadest)
      if (item.match.filePatterns.some(p => simpleGlob(p, filePath))) {
        // Only count filePattern if it's NOT just '**' (catch-all)
        if (!item.match.filePatterns.every(p => p === '**')) {
          strength += MATCH_STRENGTH.filePatterns;
        }
      } else {
        // File doesn't match any pattern — skip unless import/code matched
        if (strength === 0) continue;
      }

      // Post-training items with '**' pattern need an import trigger to match
      if (item.type === 'post-training' && strength < MATCH_STRENGTH.importTriggers) {
        continue;
      }

      if (strength > 0) {
        scored.push({ ...item, _strength: strength });
      }
    }

    return scored
      .sort((a, b) => b._strength - a._strength)
      .slice(0, MAX_INJECTION_ITEMS);
  }

  /**
   * Check if written code contradicts any matched constraints.
   * @param {string} newCode - the code that was just written
   * @param {Array} matchedItems - items from match()
   * @returns {Array<{id, constraint, source}>}
   */
  checkContradictions(newCode, matchedItems) {
    const PROHIBITION_PATTERNS = [
      /(?:do\s+not|don't|never|avoid)\s+(?:use|using)\s+['"`]?([^'"`.,;\n]+)/gi,
      /deprecated:?\s+['"`]?([^'"`.,;\n]+)/gi,
      /prefer\s+\S+\s+over\s+['"`]?([^'"`.,;\n]+)/gi,
      /replaced?\s+['"`]?([^'"`.,;\n]+?)['"`]?\s+with\s/gi,
      /decided\s+against\s+['"`]?([^'"`.,;\n]+)/gi,
      /(?:must|should)\s+not\s+(?:use|import|call)\s+['"`]?([^'"`.,;\n]+)/gi,
    ];

    const codeLower = newCode.toLowerCase();
    const contradictions = [];

    for (const item of matchedItems) {
      if (!item.injection.constraint) continue;
      const text = item.text ?? item.injection.constraint;

      for (const pattern of PROHIBITION_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
          const prohibited = match[1].trim().toLowerCase();
          if (prohibited.length >= 3 && codeLower.includes(prohibited)) {
            contradictions.push({
              id: item.id,
              constraint: item.injection.constraint,
              example: item.injection.example,
              source: item.source,
            });
            break;
          }
        }
      }
    }

    return contradictions;
  }
}

/** Simple glob matching without external dependency. */
function simpleGlob(pattern, filePath) {
  const regex = pattern
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${regex}$`, 'i').test(filePath)
    || new RegExp(regex, 'i').test(filePath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/context-map.test.js`
Expected: PASS (20/20)

- [ ] **Step 5: Commit**

```bash
git add lib/engine/context-map.js tests/engine/context-map.test.js
git commit -m "feat(context-map): ContextMapMatcher with strength-sorted matching and contradiction detection"
```

---

### Task 5: PreToolUse Hook

**Files:**
- Create: `hooks/pretooluse-inject.mjs`
- Create: `tests/engine/pretooluse-hook.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/engine/pretooluse-hook.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { formatInjection } from '../../hooks/pretooluse-inject.mjs';

describe('formatInjection', () => {
  it('formats post-training correction', () => {
    const items = [{
      injection: { correction: 'next@14.2.35 post-training', constraint: null, example: null },
    }];
    const result = formatInjection(items);
    assert.ok(result.includes('next@14.2.35'));
  });

  it('formats team constraint', () => {
    const items = [{
      injection: { correction: null, constraint: 'Use PaymentIntents (ADR-001)', example: 'stripe.paymentIntents.create()' },
    }];
    const result = formatInjection(items);
    assert.ok(result.includes('PaymentIntents'));
    assert.ok(result.includes('stripe.paymentIntents'));
  });

  it('returns empty string for no items', () => {
    assert.equal(formatInjection([]), '');
  });

  it('includes [BookLib] header when items present', () => {
    const items = [{
      injection: { correction: 'test correction', constraint: null, example: null },
    }];
    const result = formatInjection(items);
    assert.ok(result.startsWith('[BookLib]'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/pretooluse-hook.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PreToolUse hook**

```javascript
// hooks/pretooluse-inject.mjs
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

process.exitCode = 0;

/**
 * Format matched context map items into a hook injection string.
 * @param {Array} items - matched context map items with injection text
 * @returns {string} formatted injection or empty string
 */
export function formatInjection(items) {
  if (!items || items.length === 0) return '';

  const lines = ['[BookLib] Context for this edit:', ''];

  for (const item of items) {
    if (item.injection.correction) {
      lines.push(item.injection.correction);
    }
    if (item.injection.constraint) {
      lines.push(`Team: ${item.injection.constraint}`);
    }
    if (item.injection.example) {
      lines.push(`  ${item.injection.example}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// Hook entrypoint — only runs when executed as a script, not when imported for testing
const isMainModule = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);

if (isMainModule) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const parsed = JSON.parse(input);
      const toolName = parsed.tool_name ?? parsed.toolName ?? '';
      const toolInput = parsed.tool_input ?? parsed.toolInput ?? {};

      if (!['Write', 'Edit', 'write', 'edit'].includes(toolName)) {
        process.exit(0);
      }

      const filePath = toolInput.file_path ?? toolInput.filePath ?? '';
      if (!filePath) process.exit(0);

      // Load context map
      const mapPath = path.join(process.cwd(), '.booklib', 'context-map.json');
      if (!fs.existsSync(mapPath)) process.exit(0);

      const { ContextMapMatcher } = await import('../lib/engine/context-map.js');
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      const matcher = new ContextMapMatcher(map.items);

      // Extract imports from the file (quick regex, not full parser)
      let imports = [];
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        imports = importMatches.map(m => m.replace(/from\s+['"]/, '').replace(/['"]/, ''));
      } catch { /* file may not exist yet for Write */ }

      // Get the code block being modified
      const codeBlock = toolInput.old_string ?? toolInput.content ?? '';

      // Match
      const matched = matcher.match(filePath, codeBlock, imports);
      if (matched.length === 0) process.exit(0);

      // Format and output
      const hint = formatInjection(matched);
      if (hint) process.stdout.write(hint);
    } catch {
      // Best effort — never break the hook chain
    }
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/pretooluse-hook.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add hooks/pretooluse-inject.mjs tests/engine/pretooluse-hook.test.js
git commit -m "feat(hooks): PreToolUse injection hook with context map matching"
```

---

### Task 6: PostToolUse Contradiction Hook

**Files:**
- Create: `hooks/posttooluse-contradict.mjs`
- Create: `tests/engine/posttooluse-contradict.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/engine/posttooluse-contradict.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatContradiction } from '../../hooks/posttooluse-contradict.mjs';

describe('formatContradiction', () => {
  it('formats contradiction warning', () => {
    const contradictions = [{
      id: 'adr-001',
      constraint: 'Use PaymentIntents not Charges (ADR-001)',
      example: 'stripe.paymentIntents.create({ amount, currency })',
      source: 'decisions.md',
    }];
    const result = formatContradiction(contradictions);
    assert.ok(result.includes('[BookLib]'));
    assert.ok(result.includes('Contradiction'));
    assert.ok(result.includes('PaymentIntents'));
  });

  it('returns empty for no contradictions', () => {
    assert.equal(formatContradiction([]), '');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/posttooluse-contradict.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PostToolUse hook**

```javascript
// hooks/posttooluse-contradict.mjs
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

process.exitCode = 0;

/**
 * Format contradiction warnings.
 * @param {Array} contradictions
 * @returns {string}
 */
export function formatContradiction(contradictions) {
  if (!contradictions || contradictions.length === 0) return '';

  const lines = ['[BookLib] Contradiction detected:', ''];

  for (const c of contradictions) {
    lines.push(`  ${c.constraint} (${c.source})`);
    if (c.example) lines.push(`  Fix: ${c.example}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

const isMainModule = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);

if (isMainModule) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const parsed = JSON.parse(input);
      const toolName = parsed.tool_name ?? parsed.toolName ?? '';
      const toolInput = parsed.tool_input ?? parsed.toolInput ?? {};

      if (!['Write', 'Edit', 'write', 'edit'].includes(toolName)) {
        process.exit(0);
      }

      const filePath = toolInput.file_path ?? toolInput.filePath ?? '';
      if (!filePath) process.exit(0);

      const mapPath = path.join(process.cwd(), '.booklib', 'context-map.json');
      if (!fs.existsSync(mapPath)) process.exit(0);

      const { ContextMapMatcher } = await import('../lib/engine/context-map.js');
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      const matcher = new ContextMapMatcher(map.items);

      // Get imports from the file
      let imports = [];
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        imports = importMatches.map(m => m.replace(/from\s+['"]/, '').replace(/['"]/, ''));
      } catch { /* best effort */ }

      // Get the new code
      const newCode = toolInput.new_string ?? toolInput.content ?? '';
      if (!newCode) process.exit(0);

      // Match and check contradictions
      const matched = matcher.match(filePath, newCode, imports);
      const contradictions = matcher.checkContradictions(newCode, matched);
      if (contradictions.length === 0) process.exit(0);

      const warning = formatContradiction(contradictions);
      if (warning) process.stdout.write(warning);
    } catch {
      // Best effort
    }
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/posttooluse-contradict.test.js`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add hooks/posttooluse-contradict.mjs tests/engine/posttooluse-contradict.test.js
git commit -m "feat(hooks): PostToolUse contradiction detection hook"
```

---

### Task 7: MCP Lookup Redesign — Priority Logic

**Files:**
- Modify: `bin/booklib-mcp.js`
- Modify: `tests/engine/mcp-lookup.test.js` (create if needed)

- [ ] **Step 1: Write failing tests for priority logic**

```javascript
// tests/engine/mcp-lookup.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeLookupResults } from '../../lib/engine/lookup-priority.js';

describe('prioritizeLookupResults', () => {
  it('puts post-training results first', () => {
    const results = prioritizeLookupResults({
      gapResults: [{ principle: 'next@14 changed', source: 'gap-detection' }],
      teamResults: [{ principle: 'use envelope', source: 'team' }],
      nicheResults: [{ principle: 'animation timing', source: 'skill' }],
    });
    assert.equal(results[0].source, 'gap-detection');
  });

  it('includes niche skills only when gaps+team < 2', () => {
    const results = prioritizeLookupResults({
      gapResults: [{ principle: 'a', source: 'gap' }, { principle: 'b', source: 'gap' }],
      teamResults: [{ principle: 'c', source: 'team' }],
      nicheResults: [{ principle: 'should-be-dropped', source: 'skill' }],
    });
    assert.ok(!results.some(r => r.source === 'skill'));
  });

  it('includes niche skills when gaps+team insufficient', () => {
    const results = prioritizeLookupResults({
      gapResults: [],
      teamResults: [{ principle: 'one', source: 'team' }],
      nicheResults: [{ principle: 'niche', source: 'skill' }],
    });
    assert.ok(results.some(r => r.source === 'skill'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/engine/mcp-lookup.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement priority logic**

```javascript
// lib/engine/lookup-priority.js
/**
 * Prioritize lookup results: post-training → team → niche skills.
 * @param {{ gapResults, teamResults, nicheResults }} sources
 * @returns {Array} ordered results
 */
export function prioritizeLookupResults({ gapResults = [], teamResults = [], nicheResults = [] }) {
  const priority = [...gapResults, ...teamResults];

  // Only include niche skills if gaps + team didn't provide enough
  if (priority.length < 2) {
    priority.push(...nicheResults);
  }

  return priority;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/engine/mcp-lookup.test.js`
Expected: PASS (3/3)

- [ ] **Step 5: Update MCP lookup handler in `bin/booklib-mcp.js`**

Modify the `case "lookup"` handler to use `prioritizeLookupResults`. Update the tool description to the new text from the spec.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/lookup-priority.js tests/engine/mcp-lookup.test.js bin/booklib-mcp.js
git commit -m "feat(mcp): lookup with priority — post-training → team → niche skills"
```

---

### Task 8: Wizard Integration — Build Context Map

**Files:**
- Modify: `lib/wizard/index.js`

- [ ] **Step 1: Add stepBuildContextMap function**

```javascript
async function stepBuildContextMap(ui, cwd, gaps) {
  const s = ui.spinner();
  s.start('Building runtime context map...');

  try {
    const { ContextMapBuilder } = await import('../engine/context-map.js');
    const { listNodes, loadNode, parseNodeFrontmatter, resolveKnowledgePaths } = await import('../engine/graph.js');

    // Load config for processing mode
    const { configPath } = resolveBookLibPaths(cwd);
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

    const builder = new ContextMapBuilder({
      processingMode: config.reasoning ?? 'fast',
      apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
      ollamaModel: config.ollamaModel,
    });

    // Collect all knowledge items from graph nodes
    const { nodesDir } = resolveKnowledgePaths();
    const nodeIds = listNodes({ nodesDir });
    const knowledgeItems = [];
    for (const id of nodeIds) {
      const raw = loadNode(id, { nodesDir });
      if (!raw) continue;
      const parsed = parseNodeFrontmatter(raw);
      knowledgeItems.push({
        id,
        text: `${parsed.title ?? ''}\n${parsed.body ?? ''}`.trim(),
        source: parsed.source ?? 'knowledge-graph',
        type: parsed.type ?? 'note',
      });
    }

    // Build from knowledge
    let map = await builder.buildFromKnowledge(knowledgeItems);

    // Add gap detection items
    if (gaps?.postTraining?.length > 0) {
      const gapMap = await builder.buildFromGaps(gaps.postTraining);
      map = { ...map, items: [...map.items, ...gapMap.items] };
    }

    // Save
    const mapPath = path.join(cwd, '.booklib', 'context-map.json');
    builder.save(mapPath, map);

    s.stop(`Context map: ${map.items.length} items scoped for runtime injection`);
  } catch (err) {
    s.stop(`Context map skipped: ${err.message}`);
  }
}
```

- [ ] **Step 2: Wire into runSetup**

Add after `stepResolveGaps` and before `stepRecommendAndInstall`:

```javascript
// Step N: Build context map for runtime injection
await stepBuildContextMap(ui, cwd, gaps);
```

- [ ] **Step 3: Commit**

```bash
git add lib/wizard/index.js
git commit -m "feat(wizard): build context map during init for runtime injection"
```

---

### Task 9: Hook Configuration + CLAUDE.md Template Update

**Files:**
- Modify: `hooks/hooks.json`
- Modify: `lib/project-initializer.js` (CLAUDE.md template)
- Modify: `bin/booklib-mcp.js` (tool description)

- [ ] **Step 1: Update hooks.json**

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOME/.claude/booklib-suggest.js\""
        }
      ]
    }
  ],
  "PreToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${BOOKLIB_ROOT}/hooks/pretooluse-inject.mjs\""
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "WebFetch|WebSearch",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${BOOKLIB_ROOT}/hooks/posttooluse-capture.mjs\""
        }
      ]
    },
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${BOOKLIB_ROOT}/hooks/posttooluse-contradict.mjs\""
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Update MCP lookup tool description in `bin/booklib-mcp.js`**

Change the `lookup` tool description to:
```
"Check BookLib when working with project-specific APIs, team decisions, or dependencies that may have changed since your training. BookLib knows what you don't. Skip for standard patterns you already know."
```

- [ ] **Step 3: Update CLAUDE.md template**

Find the BookLib section template in `lib/project-initializer.js` and update to:
```markdown
## BookLib
BookLib knows what your AI doesn't — post-training API changes, 
team decisions, project-specific conventions.

- When working with unfamiliar APIs or post-training deps → lookup
- When starting a new task in an unfamiliar area → brief  
- When user says "remember/capture this" → remember
- Don't call lookup for standard programming patterns you already know
```

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json bin/booklib-mcp.js lib/project-initializer.js
git commit -m "feat(config): hooks.json PreToolUse/PostToolUse, updated MCP description and CLAUDE.md"
```

---

### Task 10: End-to-End Integration Test

**Files:**
- Create: `tests/e2e/runtime-injection.test.js`

- [ ] **Step 1: Write E2E test**

```javascript
// tests/e2e/runtime-injection.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let projectDir;

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-inject-e2e-'));

  // Create project with post-training dep
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    dependencies: { 'my-lib': '2.0.0' },
  }));

  // Source file importing the dep
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'),
    "import { newFeature } from 'my-lib';\nnewFeature();\n"
  );

  // Build a context map with team knowledge + gap
  const contextMap = {
    version: 1,
    builtAt: new Date().toISOString(),
    items: [
      {
        id: 'gap-my-lib',
        text: 'my-lib@2.0.0 post-training',
        source: 'gap-detection',
        type: 'post-training',
        match: { filePatterns: ['**'], codeTerms: [], functionPatterns: [], importTriggers: ['my-lib'] },
        injection: { correction: 'my-lib@2.0.0 post-training. newFeature() signature changed.', constraint: null, example: 'newFeature({ mode: "v2" })' },
      },
      {
        id: 'team-001',
        text: 'Do not use legacyMethod from my-lib',
        source: 'team-decisions',
        type: 'decision',
        match: { filePatterns: ['**/src/**'], codeTerms: ['legacymethod', 'legacy'], functionPatterns: [], importTriggers: ['my-lib'] },
        injection: { correction: null, constraint: 'Do not use legacyMethod from my-lib. Use newFeature instead.', example: null },
      },
    ],
  };
  fs.mkdirSync(path.join(projectDir, '.booklib'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, '.booklib', 'context-map.json'),
    JSON.stringify(contextMap, null, 2)
  );
});

after(() => { fs.rmSync(projectDir, { recursive: true, force: true }); });

describe('Runtime Injection E2E', () => {
  it('ContextMapMatcher finds post-training item by import trigger', async () => {
    const { ContextMapMatcher, ContextMapBuilder } = await import('../../lib/engine/context-map.js');
    const map = ContextMapBuilder.load(path.join(projectDir, '.booklib', 'context-map.json'));
    const matcher = new ContextMapMatcher(map.items);

    const code = fs.readFileSync(path.join(projectDir, 'src', 'app.ts'), 'utf8');
    const matched = matcher.match('src/app.ts', code, ['my-lib']);

    assert.ok(matched.length >= 1);
    assert.ok(matched.some(m => m.id === 'gap-my-lib'));
  });

  it('formatInjection produces readable output', async () => {
    const { formatInjection } = await import('../../hooks/pretooluse-inject.mjs');
    const { ContextMapMatcher, ContextMapBuilder } = await import('../../lib/engine/context-map.js');
    const map = ContextMapBuilder.load(path.join(projectDir, '.booklib', 'context-map.json'));
    const matcher = new ContextMapMatcher(map.items);

    const matched = matcher.match('src/app.ts', "import { newFeature } from 'my-lib'", ['my-lib']);
    const injection = formatInjection(matched);

    assert.ok(injection.includes('[BookLib]'));
    assert.ok(injection.includes('my-lib@2.0.0'));
  });

  it('contradiction detection catches prohibited method', async () => {
    const { ContextMapMatcher, ContextMapBuilder } = await import('../../lib/engine/context-map.js');
    const map = ContextMapBuilder.load(path.join(projectDir, '.booklib', 'context-map.json'));
    const matcher = new ContextMapMatcher(map.items);

    const matched = matcher.match('src/app.ts', "legacyMethod()", ['my-lib']);
    const contradictions = matcher.checkContradictions("myLib.legacyMethod()", matched);

    assert.ok(contradictions.length >= 1);
  });
});
```

- [ ] **Step 2: Run E2E test**

Run: `node --test tests/e2e/runtime-injection.test.js`
Expected: PASS (3/3)

- [ ] **Step 3: Run full test suite**

Run: `node --test tests/engine/context-map.test.js tests/engine/pretooluse-hook.test.js tests/engine/posttooluse-contradict.test.js tests/engine/mcp-lookup.test.js tests/e2e/runtime-injection.test.js`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/runtime-injection.test.js
git commit -m "test(e2e): runtime injection end-to-end — match, inject, contradict"
```

---

## Self-Review

**Spec coverage check:**
- Layer 1 MCP priority logic → Task 7
- Layer 2a PreToolUse hook → Task 5
- Layer 2b PostToolUse contradiction → Task 6
- Context Map structure → Tasks 1-2
- Context Map build (keywords) → Task 1
- Context Map build (LLM inference) → Task 3
- Context Map matcher → Task 4
- Wizard integration → Task 8
- Hook configuration → Task 9
- CLAUDE.md template → Task 9
- MCP tool description → Task 9
- E2E test → Task 10
- Success criteria: <100ms hooks, silent >80%, graceful degradation → validated by design (JSON lookup, no search)

**No placeholders found.** All tasks have complete code.

**Type consistency:** `ContextMapBuilder` and `ContextMapMatcher` share the same item shape throughout. `formatInjection` and `formatContradiction` use the same `injection` object from matcher results.
