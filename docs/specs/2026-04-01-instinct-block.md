# Spec: Instinct Block Generator
*Date: 2026-04-01 | Status: Draft*

## Problem
The agent needs 5-10 lines of behavioral triggers telling it WHEN to use BookLib tools. This block differs based on whether the tool has MCP (tool names) or not (CLI commands).

## Solution
New module `lib/instinct-block.js` that generates the instinct block for a given tool target.

## Output — MCP-capable tools
```markdown
## BookLib
BookLib MCP tools are available for code quality guidance.
- Before answering best-practices questions → search_skills
- When reviewing or writing code → search_skills for relevant principles
- When user says "remember/note/capture this" → create_note
- For deep file review against a skill → audit_content
- When code quality issues accumulate → suggest running `booklib doctor`
```

## Output — Non-MCP tools (OpenHands, Junie, Letta)
```markdown
## BookLib
Code quality skills are active for this project.
Run `booklib search "query"` to find relevant principles before reviewing code.
Run `booklib capture --title "..." --type insight` to save knowledge.
Run `booklib audit <skill> <file>` for deep file review.
Run `booklib doctor` when skills feel irrelevant.
```

## API
```js
import { renderInstinctBlock } from './instinct-block.js';

const block = renderInstinctBlock('claude');   // MCP version
const block = renderInstinctBlock('junie');    // CLI version
```

## Which tools have MCP
```js
const MCP_TOOLS = new Set([
  'claude', 'cursor', 'copilot', 'gemini', 'codex',
  'windsurf', 'roo-code', 'goose', 'zed', 'continue',
]);
```

## Files Changed
- Create: `lib/instinct-block.js`
- Test: `tests/instinct-block.test.js`

## Replaces
Supersedes `lib/agent-behaviors.js` (Spec B) which was built for the old content-dump approach. The instinct block is much smaller — 5-10 lines vs full behavioral descriptions.

## No Dependencies
