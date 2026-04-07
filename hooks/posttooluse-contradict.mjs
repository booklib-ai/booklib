#!/usr/bin/env node
// PostToolUse hook — checks written code against context map constraints
// after Edit/Write tool use. Outputs a hint when contradictions are found.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextMapMatcher } from '../lib/engine/context-map.js';

/**
 * Format contradictions into a warning hint.
 * @param {Array<{id: string, constraint: string, example: string|null, source: string|null}>} contradictions
 * @returns {string}
 */
export function formatContradiction(contradictions) {
  if (!contradictions?.length) return '';

  const lines = ['[BookLib] Contradiction detected:'];

  for (const v of contradictions) {
    lines.push(`  ${v.constraint}`);
    if (v.example) {
      lines.push(`    Fix: ${v.example}`);
    }
  }

  return lines.join('\n');
}

// Only run stdin reading when executed as a script, not when imported for testing
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  process.exitCode = 0;

  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const parsed = JSON.parse(input);
      const toolName = parsed.tool_name ?? parsed.toolName ?? '';
      const toolInput = parsed.tool_input ?? parsed.toolInput ?? {};

      const writeTools = ['Write', 'Edit', 'write', 'edit'];
      if (!writeTools.includes(toolName)) process.exit(0);

      const filePath = toolInput.file_path ?? toolInput.filePath ?? '';
      if (!filePath) process.exit(0);

      const mapPath = join(process.cwd(), '.booklib', 'context-map.json');
      const raw = readFileSync(mapPath, 'utf8');
      const map = JSON.parse(raw);
      if (!map?.items?.length) process.exit(0);

      const newCode = toolInput.new_string ?? toolInput.content ?? '';
      if (!newCode) process.exit(0);

      const importRe = /from\s+['"]([^'"]+)['"]/g;
      const imports = [];
      let match;
      while ((match = importRe.exec(newCode)) !== null) {
        imports.push(match[1]);
      }

      const matcher = new ContextMapMatcher(map.items);
      const matched = matcher.match(filePath, newCode, imports);
      const contradictions = matcher.checkContradictions(newCode, matched);

      if (contradictions.length > 0) {
        process.stdout.write(formatContradiction(contradictions));
      }
    } catch {
      // Best effort — don't break the hook chain
    }

    process.exit(0);
  });
}
