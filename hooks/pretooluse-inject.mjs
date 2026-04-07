#!/usr/bin/env node
// PreToolUse hook — injects relevant context from the BookLib context map
// before Edit/Write tool use. Reads tool info from stdin (JSON), matches
// file + code against context map, outputs injection hints.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextMapMatcher } from '../lib/engine/context-map.js';

/**
 * Format matched context map items into an injection hint.
 * @param {Array<{injection: {correction: string|null, constraint: string|null, example: string|null}, source?: string|null}>} items
 * @returns {string}
 */
export function formatInjection(items) {
  if (!items?.length) return '';

  const lines = ['[BookLib] Context for this edit:'];

  for (const item of items) {
    const { correction, constraint, example } = item.injection ?? {};

    if (correction) {
      lines.push(`  ${correction}`);
    } else if (constraint) {
      const team = item.source ? `${item.source}: ` : '';
      lines.push(`  ${team}${constraint}`);
    }

    if (example) {
      lines.push(`    ${example}`);
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

      const fileContent = toolInput.old_string ?? toolInput.content ?? '';
      const importRe = /from\s+['"]([^'"]+)['"]/g;
      const imports = [];
      let match;
      while ((match = importRe.exec(fileContent)) !== null) {
        imports.push(match[1]);
      }

      const matcher = new ContextMapMatcher(map.items);
      const matched = matcher.match(filePath, fileContent, imports);

      if (matched.length > 0) {
        process.stdout.write(formatInjection(matched));
      }
    } catch {
      // Best effort — don't break the hook chain
    }

    process.exit(0);
  });
}
