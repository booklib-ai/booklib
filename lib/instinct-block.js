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
BookLib MCP tools are available for code quality guidance.
- Before answering best-practices questions \u2192 search_skills
- When reviewing or writing code \u2192 search_skills for relevant principles
- When user says "remember/note/capture this" \u2192 create_note
- For deep file review against a skill \u2192 audit_content
- When code quality issues accumulate \u2192 suggest running \`booklib doctor\``;
  }

  return `## BookLib
Code quality skills are active for this project.
Run \`booklib search "query"\` to find relevant principles before reviewing code.
Run \`booklib capture --title "..." --type insight\` to save knowledge.
Run \`booklib audit <skill> <file>\` for deep file review.
Run \`booklib doctor\` when skills feel irrelevant.`;
}
