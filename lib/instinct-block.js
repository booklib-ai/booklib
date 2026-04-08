/**
 * Returns CLI command instructions for non-MCP tools.
 * MCP-capable tools return null — they discover BookLib via MCP protocol.
 *
 * @param {string} target - Tool target (claude, cursor, junie, etc.)
 * @returns {string|null} Markdown block for non-MCP tools, null for MCP tools
 */

const MCP_TOOLS = new Set([
  'claude', 'cursor', 'copilot', 'gemini', 'codex',
  'windsurf', 'roo-code', 'goose', 'zed', 'continue',
]);

export function renderInstinctBlock(target) {
  if (MCP_TOOLS.has(target)) return null;

  return `## BookLib
Run \`booklib search "query"\` for relevant principles.
Run \`booklib capture --title "..." --type decision\` to save knowledge.
Run \`booklib doctor\` for health check.`;
}
