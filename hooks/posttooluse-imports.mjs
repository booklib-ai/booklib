#!/usr/bin/env node
// PostToolUse hook — checks imports after Write/Edit tool use.
// Reads tool info from stdin (JSON), runs ImportChecker on written files,
// outputs a hint when unknown imports are found.

import path from 'node:path';
import { detectLanguage } from '../lib/engine/import-parser.js';

process.exitCode = 0;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', async () => {
  let toolName = '';
  let toolInput = {};

  try {
    const parsed = JSON.parse(input);
    toolName = parsed.tool_name ?? parsed.toolName ?? '';
    toolInput = parsed.tool_input ?? parsed.toolInput ?? {};
  } catch {
    process.exit(0);
  }

  const writeTools = ['Write', 'Edit', 'write', 'edit'];
  if (!writeTools.includes(toolName)) process.exit(0);

  const filePath = toolInput.file_path ?? toolInput.filePath ?? '';
  if (!filePath) process.exit(0);

  // Use the parser's language detection instead of duplicating extension list
  if (!detectLanguage(filePath)) process.exit(0);

  try {
    const { ImportChecker } = await import('../lib/engine/import-checker.js');
    const checker = new ImportChecker();
    const result = await checker.checkFile(filePath);

    if (result.unknown.length === 0) process.exit(0);

    const lines = [
      '',
      `[booklib] ${result.unknown.length} unknown import(s) in ${path.basename(filePath)}:`,
    ];

    for (const imp of result.unknown.slice(0, 3)) {
      lines.push(`  ${imp.module} — not in BookLib index`);
    }
    if (result.unknown.length > 3) {
      lines.push(`  ... and ${result.unknown.length - 3} more`);
    }

    lines.push(`  Run: booklib check-imports ${filePath}`);
    lines.push('');
    process.stdout.write(lines.join('\n'));
  } catch {
    // Best effort — don't break the hook chain
  }

  // Future integration point: decision contradiction checking.
  // DecisionChecker requires a BookLibSearcher with the embedding model loaded,
  // which is too heavy for a PostToolUse hook. Will activate when hooks can
  // access a persistent searcher instance (e.g., via MCP or shared process).

  process.exit(0);
});
