/**
 * Generates the instinct block -- 5-10 lines of behavioral triggers
 * that tell the AI agent WHEN to use BookLib tools.
 * Differentiates between MCP-capable tools (use MCP tool names) and
 * non-MCP tools (use CLI commands).
 *
 * @param {string} target - Tool target (claude, cursor, copilot, etc.)
 * @returns {string} Markdown block
 */

const MCP_TOOLS = new Set([
  'claude', 'cursor', 'copilot', 'gemini', 'codex',
  'windsurf', 'roo-code', 'goose', 'zed', 'continue',
]);

export function renderInstinctBlock(target) {
  if (MCP_TOOLS.has(target)) {
    return `## BookLib
BookLib knows what your AI doesn't \u2014 post-training API changes,
team decisions, project-specific conventions.

- When working with unfamiliar APIs or post-training deps \u2192 lookup
- When starting a new task in an unfamiliar area \u2192 brief
- When user says "remember/capture this" \u2192 remember
- Don't call lookup for standard programming patterns you already know`;
  }

  return `## BookLib
Code quality skills are active for this project.
Run \`booklib search "query"\` to find relevant principles before reviewing code.
Run \`booklib capture --title "..." --type insight\` to save knowledge.
Run \`booklib audit <skill> <file>\` for deep file review.
Run \`booklib doctor\` when skills feel irrelevant.`;
}
