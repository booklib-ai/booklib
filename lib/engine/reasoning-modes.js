import fs from 'node:fs';
import path from 'node:path';
import { buildStructuredResponse } from './structured-response.js';

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
  const { maxPrinciples = 3, file, ollamaModel = 'phi3' } = opts;

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
    const resultsText = results.slice(0, 10).map((r, i) =>
      `[${i + 1}] Source: ${r.metadata?.name ?? 'unknown'}\n${(r.text ?? '').slice(0, 300)}`
    ).join('\n\n');

    const prompt = `You are a knowledge filter. Given a query and search results, select ONLY directly relevant results. Extract the key principle from each. Return a JSON array.

Query: "${query}"
${file ? `File: ${file}` : ''}

Results:
${resultsText}

Return JSON array: [{"principle": "...", "context": "...", "source": "..."}]
If nothing relevant, return [].
Maximum ${maxPrinciples} principles. Be strict.`;

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
  const { maxPrinciples = 3, file, apiKey, apiModel, apiProvider = 'anthropic' } = opts;

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
    const resultsText = results.slice(0, 10).map((r, i) =>
      `[${i + 1}] Source: ${r.metadata?.name ?? 'unknown'}\n${(r.text ?? '').slice(0, 300)}`
    ).join('\n\n');

    const prompt = `You are a knowledge filter. Given a user's query and search results from a knowledge base, select ONLY the results that are directly relevant. Extract the key principle from each relevant result. Return JSON.

Query: "${query}"
${file ? `File being edited: ${file}` : ''}

Search results:
${resultsText}

Return a JSON array of relevant principles. Each entry: {"principle": "...", "context": "...", "source": "..."}
If nothing is relevant, return an empty array [].
Maximum ${maxPrinciples} principles. Be strict — irrelevant results should be excluded.`;

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
