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

  const isSearch = ['WebSearch', 'web_search'].includes(toolName);
  const url = toolInput.url ?? '';
  const query = toolInput.query ?? toolInput.input ?? '';

  let suggestedTitle;
  let sourceDesc;

  if (isSearch && query) {
    suggestedTitle = query.slice(0, 60);
    sourceDesc = `search: "${query}"`;
  } else if (url) {
    try {
      const u = new URL(url);
      const lastSegment = u.pathname.split('/').filter(Boolean).pop() ?? '';
      const readable = lastSegment.replace(/[-_]/g, ' ').replace(/\.\w+$/, '').trim();
      suggestedTitle = (readable ? `${readable} (${u.hostname})` : u.hostname).slice(0, 60);
    } catch {
      suggestedTitle = url.slice(0, 60);
    }
    sourceDesc = url;
  } else {
    process.stdout.write('\n[booklib] To save what you found: booklib note "<title>"\n');
    process.exit(0);
  }

  // Strip shell metacharacters so the displayed command is always safe to copy-paste
  const safeTitle = suggestedTitle.replace(/["$`\\]/g, '');

  const hint = [
    '',
    `[booklib] Knowledge capture — ${sourceDesc}`,
    `  Save what you found:`,
    `    echo "paste key findings here" | booklib note "${safeTitle}"`,
    `  Or create a research template:`,
    `    booklib research "${safeTitle}"`,
    '',
  ].join('\n');

  process.stdout.write(hint);
  process.exit(0);
});
