# BookLib

Context engineering tool for AI coding assistants. Detects post-training knowledge gaps, resolves them via MCP.

## Stack
JavaScript (Node.js >= 18, ES modules). No build step. No TypeScript.

## Key Directories
- `bin/` — CLI (`booklib.js`) and MCP server (`booklib-mcp.js`)
- `lib/engine/` — core: indexer, searcher, gap-detector, context-map, registries
- `lib/wizard/` — `booklib init` interactive wizard
- `hooks/` — PreToolUse/PostToolUse hooks for Claude Code
- `skills/` — 23 bundled skills (SKILL.md files)
- `tests/` — 767 tests via `node:test`

## Commands
- `npm install` — install deps
- `npm test` — run all tests (must pass before committing)
- `npm link` — link for local CLI testing
- `node bin/booklib.js <cmd>` — run CLI from source

## Rules
- Always add a test when fixing a bug
- Never write to CLAUDE.md or other agent config files from code — MCP handles discovery
- MCP tools: lookup, review, remember, verify, guard (5 exposed, old names kept as aliases)
- Keep CLAUDE.md under 30 lines — point to skills for depth

BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.
