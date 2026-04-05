// A/B Test Findings (April 2026):
//
// Three processing modes tested against codegen quality:
//   fast (regex extraction):     No model curation. Returns raw chunks.
//   local (Qwen 2.5 14B):       Fixed by atomic chunking (was broken with blob chunks).
//   api (Haiku):                 Best for retrieval quality (+60%). For codegen, the
//                                "synthesize a skill" pattern outperforms raw filtering.
//
// Key finding: the prompt matters more than the mode.
//   "Be strict" prompt → over-filters, loses specific details (SameSite, @Pattern)
//   "Synthesize a skill" prompt → produces structured Principles/Anti-Patterns/Code
//   that the codegen model follows more consistently.
//
// Best codegen results: search → top 15 small chunks → synthesize task-specific skill
// See: webshop-test/codegen-ab.js, webshop-test/codegen-ui-test.js

import fs from 'node:fs';
import path from 'node:path';
import { buildStructuredResponse } from './structured-response.js';
import { getSynthesisPrompt } from './synthesis-templates.js';

/**
 * Groups search results by source and formats them as clean bullet points.
 * Strips frontmatter and avoids mid-sentence cuts.
 *
 * @param {Array} results - raw search results with text and metadata
 * @returns {string} formatted text grouped by source
 */
export function formatResultsForModel(results) {
  if (!results || results.length === 0) return '(no results)';

  // Group by source + parentTitle. Option to join siblings controlled by joinSiblings param.
  const groups = new Map();
  for (const r of results) {
    const name = r.metadata?.name ?? r.metadata?.title ?? r.metadata?.id ?? 'unknown';
    const parentTitle = r.metadata?.parentTitle ?? '';
    const key = parentTitle ? `${name}|||${parentTitle}` : name;

    if (!groups.has(key)) {
      groups.set(key, { name, parentTitle, bullets: [] });
    }

    const text = (r.text ?? '').trim();
    if (text) {
      const cleaned = text.replace(/^---[\s\S]*?---\s*/m, '').trim();
      if (cleaned) groups.get(key).bullets.push(cleaned);
    }
  }

  let index = 0;
  const sections = [];
  for (const { name, parentTitle, bullets } of groups.values()) {
    if (bullets.length === 0) continue;
    index++;
    const title = parentTitle
      ? `[${index}] Source: ${name} — "${parentTitle}"`
      : `[${index}] Source: ${name}`;
    const body = bullets.map(b => `    • ${b}`).join('\n');
    sections.push(`${title}\n${body}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : '(no results)';
}

/**
 * Loads API key from .env file if not already in process.env.
 * Checks project-local .env first, then home directory .env.
 */
function loadEnvKey() {
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) return;

  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.env.HOME ?? '', '.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^(ANTHROPIC_API_KEY|OPENAI_API_KEY)=(.+)$/);
        if (match) {
          process.env[match[1]] = match[2].trim();
        }
      }
    } catch { /* best-effort */ }
  }
}

/**
 * Process search results through the configured reasoning mode.
 *
 * @param {string} query - the search query
 * @param {Array} results - raw search results
 * @param {string} mode - 'fast' | 'local' | 'api'
 * @param {object} opts
 * @param {number} [opts.maxPrinciples=3]
 * @param {string} [opts.file]
 * @param {string} [opts.apiKey] - for API mode
 * @param {string} [opts.apiModel] - for API mode
 * @param {string} [opts.apiProvider] - 'anthropic' | 'openai'
 * @param {string} [opts.ollamaModel] - for local mode
 * @returns {Promise<object>} structured response
 */
export async function processResults(query, results, mode = 'fast', opts = {}) {
  // Auto-load .env keys if not in environment
  if (mode === 'api' && !opts.apiKey) {
    loadEnvKey();
    if (!opts.apiKey) {
      opts.apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY;
      opts.apiProvider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
    }
  }

  switch (mode) {
    case 'local':
      return processLocal(query, results, opts);
    case 'api':
      return processAPI(query, results, opts);
    case 'fast':
    default:
      return buildStructuredResponse(query, results, opts);
  }
}

/**
 * Local model processing via Ollama.
 * Sends search results to a local Ollama model for relevance reasoning.
 * Falls back to fast mode if Ollama is not running.
 */
async function processLocal(query, results, opts = {}) {
  const { maxPrinciples = 3, file, ollamaModel = 'phi3', sourceType } = opts;

  if (!results || results.length === 0) {
    return { query, file: file ?? null, results: [], mode: 'local', note: 'No relevant knowledge found.' };
  }

  // Check if Ollama is running
  const ollamaUrl = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

  try {
    const healthCheck = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!healthCheck.ok) throw new Error('Ollama not responding');
  } catch {
    // Ollama not running — fall back to fast mode
    const fallback = buildStructuredResponse(query, results, { maxPrinciples, file });
    fallback.mode = 'local-fallback';
    fallback.note = 'Local AI configured but Ollama not running. Using fast mode instead.\n' +
      'To fix: start Ollama with: ollama serve\n' +
      'Or switch to API mode: set "reasoning": "api" in booklib.config.json.';
    return fallback;
  }

  try {
    const resultsText = formatResultsForModel(results);

    const prompt = sourceType
      ? getSynthesisPrompt(sourceType, { query, file, results: resultsText })
      : `You are a knowledge curator. Given a query and search results, synthesize actionable guidance. Keep specific details — code examples, annotations, configuration values. Drop only completely unrelated results.

Query: "${query}"
${file ? `File: ${file}` : ''}

Results:
${resultsText}

Return JSON array: [{"principle": "specific actionable guidance", "context": "why and how to apply", "source": "..."}]
Include all results that could help. Only drop completely unrelated ones.
Maximum ${maxPrinciples} entries.`;

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status}`);
    }

    const data = await res.json();
    const response = data.response ?? '';

    // Parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const principles = JSON.parse(jsonMatch[0]).slice(0, maxPrinciples);
      return {
        query,
        file: file ?? null,
        results: principles,
        mode: 'local',
        model: ollamaModel,
        note: `${principles.length} result(s) after local AI reasoning (${ollamaModel}).`,
      };
    }

    // Couldn't parse — fall back to fast
    const fallback = buildStructuredResponse(query, results, { maxPrinciples, file });
    fallback.mode = 'local-parse-error';
    fallback.note = `Ollama returned unparseable response. Using fast mode.`;
    return fallback;

  } catch (err) {
    const fallback = buildStructuredResponse(query, results, { maxPrinciples, file });
    fallback.mode = 'local-error';
    fallback.note = `Local reasoning failed: ${err.message}. Using fast mode.`;
    return fallback;
  }
}

/**
 * API processing — sends results to an external LLM for reasoning.
 * Requires an API key (Anthropic or OpenAI).
 *
 * The LLM receives the query + raw results and returns synthesized,
 * relevant principles. This produces the highest quality output.
 */
async function processAPI(query, results, opts = {}) {
  const { maxPrinciples = 3, file, apiKey, apiModel, apiProvider = 'anthropic', sourceType } = opts;

  if (!apiKey) {
    // Fall back to fast mode if no API key
    const fallback = buildStructuredResponse(query, results, { maxPrinciples, file });
    fallback.mode = 'api-fallback';
    fallback.note = 'API mode configured but no API key found. Using fast mode instead.\n' +
      'To fix: add your key to .env (echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env)\n' +
      'Or try local AI: set "reasoning": "local" in booklib.config.json and run Ollama.';
    return fallback;
  }

  if (!results || results.length === 0) {
    return { query, file: file ?? null, results: [], mode: 'api', note: 'No relevant knowledge found.' };
  }

  try {
    // Build the prompt for the reasoning model
    const resultsText = formatResultsForModel(results);

    const prompt = sourceType
      ? getSynthesisPrompt(sourceType, { query, file, results: resultsText })
      : `You are a knowledge curator for a coding assistant. Given a query and search results from a knowledge base, synthesize actionable guidance. Keep specific details — code examples, exact annotations, configuration values, security headers. Drop only results that are completely unrelated to the query.

Query: "${query}"
${file ? `File being edited: ${file}` : ''}

Search results:
${resultsText}

Return a JSON array. Each entry: {"principle": "the specific actionable guidance", "context": "why this matters and how to apply it", "source": "where this came from"}
Include ALL results that could help with this task — keep specific details like annotation names, config values, and code patterns. Only drop results that are about a completely different topic.
Maximum ${maxPrinciples} entries.`;

    let response;

    if (apiProvider === 'anthropic') {
      response = await callAnthropic(prompt, apiKey, apiModel ?? 'claude-haiku-4-5-20251001');
    } else {
      response = await callOpenAI(prompt, apiKey, apiModel ?? 'gpt-4o-mini');
    }

    // Parse LLM response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const principles = JSON.parse(jsonMatch[0]).slice(0, maxPrinciples);
      return {
        query,
        file: file ?? null,
        results: principles,
        mode: 'api',
        note: `${principles.length} result(s) after API reasoning (${apiProvider}).`,
      };
    }

    // Couldn't parse — fall back to fast
    const fallback = buildStructuredResponse(query, results, { maxPrinciples, file });
    fallback.mode = 'api-parse-error';
    fallback.note = 'API reasoning returned unparseable response. Using fast mode.';
    return fallback;

  } catch (err) {
    // API call failed — fall back to fast
    const fallback = buildStructuredResponse(query, results, { maxPrinciples, file });
    fallback.mode = 'api-error';
    fallback.note = `API reasoning failed: ${err.message}. Using fast mode.`;
    return fallback;
  }
}

async function callAnthropic(prompt, apiKey, model) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function callOpenAI(prompt, apiKey, model) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
