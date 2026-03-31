/**
 * Returns the agent behaviors markdown block for a given tool target.
 * @param {string} target - Tool target (claude, cursor, copilot, etc.)
 * @returns {string} Markdown block
 */
export function renderBehaviors(target) {
  const canRunCLI = !['cursor', 'copilot'].includes(target);

  if (canRunCLI) {
    return `### Code Review
When reviewing code or suggesting changes, query BookLib for relevant principles:
\`booklib search "topic relevant to the code"\`
Cite the skill and principle in your review.

### Knowledge Capture
When the user discovers a useful pattern or asks to remember something:
\`booklib capture --title "insight title" --type insight --tags relevant,tags\`

### Search Before Answering
When asked about best practices, patterns, or "how should I do X":
First run: \`booklib search "the question"\`
Use results to ground your answer in the project's active skills.

### Deep Audit
When asked to thoroughly review a file against a specific skill:
\`booklib audit <skill-name> <file-path>\`

### Health Check
When code quality issues accumulate or skills seem irrelevant:
\`booklib doctor\``;
  }

  return `### Code Quality Guidance
When reviewing or generating code, apply the principles from the active skills listed below.
Focus on the patterns and anti-patterns described in each skill's documentation.

### What These Skills Cover
Each skill represents distilled knowledge from a specific book or guide.
When making design decisions, consider which skill's principles are most relevant.`;
}
