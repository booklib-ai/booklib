// lib/engine/capture.js
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── AI prompt builders (exported for testing) ─────────────────────────────────

/** Returns the prompt used to ask Claude to structure raw dictation into a clean note. */
export function buildDictatePrompt(rawText) {
  return `You are a knowledge management assistant. Structure the following raw notes into a clean markdown knowledge note.

Raw input:
${rawText}

Return ONLY valid YAML frontmatter + markdown. The frontmatter must include:
- title: (concise, descriptive title extracted or inferred from the content)
- tags: (2-5 relevant tags as a YAML list)
- type: note

Fix grammar and typos. Preserve all meaning. Do not add information not present in the input.
Return nothing except the markdown document starting with ---.`;
}

/** Returns the prompt used to summarize a conversation transcript into a structured note. */
export function buildSummarizePrompt(transcript, title = '') {
  const titleLine = title ? `Title: ${title}\n\n` : '';
  return `You are a knowledge management assistant. Summarize this AI conversation into a structured knowledge note.

${titleLine}Conversation:
${transcript}

Return ONLY a markdown document starting with ---. Include this frontmatter:
- title: (descriptive title${title ? ` — use "${title}" as basis` : ''})
- tags: (2-5 relevant tags)
- type: note

And these sections in the body:
## Key Decisions
(bullet list of decisions made)

## Findings
(bullet list of key findings or conclusions)

## Context
(1-2 sentences of background)

Then append the full transcript inside a details element:
<details>
<summary>Full conversation transcript</summary>

${transcript}

</details>`;
}

// ── AI call (requires ANTHROPIC_API_KEY env var) ──────────────────────────────

/** Calls claude-haiku via the Anthropic Messages API. Requires ANTHROPIC_API_KEY. */
export async function callAnthropicAPI(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set. Export it or add to .env.local');
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${body}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

// ── Input helpers ─────────────────────────────────────────────────────────────

/** Opens $EDITOR (or vi) with optional initial content. Returns edited content. */
export function openEditor(initialContent = '') {
  const tmpFile = join(tmpdir(), `booklib-edit-${Date.now()}.md`);
  writeFileSync(tmpFile, initialContent, 'utf8');
  const editor = process.env.EDITOR ?? 'vi';
  spawnSync(editor, [tmpFile], { stdio: 'inherit' });
  const content = readFileSync(tmpFile, 'utf8');
  unlinkSync(tmpFile);
  return content.trim();
}

/** Reads all of stdin when piped. Returns empty string when stdin is a TTY. */
export async function readStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

/** Prompts user to type input interactively until Ctrl+D. */
export async function readInteractive(prompt = 'Type your note (Ctrl+D when done):') {
  process.stdout.write(prompt + '\n');
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}
