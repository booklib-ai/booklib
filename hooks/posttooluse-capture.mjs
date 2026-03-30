#!/usr/bin/env node
// PostToolUse hook — suggests saving knowledge after WebFetch or WebSearch.
// Reads tool info from stdin (JSON), writes a hint to stdout when relevant.

"use strict";

process.exitCode = 0;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let toolName = '';
  let toolInput = {};

  try {
    const parsed = JSON.parse(input);
    toolName = parsed.tool_name ?? parsed.toolName ?? '';
    toolInput = parsed.tool_input ?? parsed.toolInput ?? {};
  } catch {
    process.exit(0);
  }

  const captureTools = ['WebFetch', 'WebSearch', 'web_fetch', 'web_search'];
  if (!captureTools.includes(toolName)) process.exit(0);

  const url = toolInput.url ?? toolInput.query ?? '';
  const hint = url
    ? `\n[booklib] You just fetched: ${url}\nIf this contains useful knowledge: booklib note "title" or booklib research "topic"\n`
    : `\n[booklib] If the above result contains useful knowledge: booklib note "title"\n`;

  process.stdout.write(hint);
  process.exit(0);
});
