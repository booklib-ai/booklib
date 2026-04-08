# BookLib Setup Complete

## What's Automatic (No AI Decision Required)

**Hooks in Claude Code only** (fires on every Edit/Write):
- PreToolUse: Injects relevant team constraints + BookLib corrections before file edit
- PostToolUse: Checks edited code for contradictions with team decisions

**Skill learning recorded**: 14 npm packages post-May-2025 found; 49 files × 203 API names indexed (ProjectAnalyzer cross-reference)

**Knowledge base**: 5 team nodes from .specify/ and docs/ (ADRs, roadmap, architecture) + 19 context map items linking knowledge to code scopes

**Tool registration**: MCP servers configured for Cursor, VS Code, and Gemini with `booklib-mcp` — tools available but require AI to call them

**Guidelines written**: .kiro/steering/booklib-standards.md populated with BookLib agent behaviors and project conventions

## What Depends on AI Decision

BookLib integrates via MCP. Run `booklib init` to register.
Tools: lookup, review, remember, verify, guard.
See skills/booklib-mcp-guide/SKILL.md for usage guide.

## What Doesn't Fire in Other Editors

Hooks (PreToolUse/PostToolUse) **only fire in Claude Code**. Cursor, VS Code, and Gemini use MCP tools instead — which require explicit calls. Junie uses neither.

## Next Steps

1. First code edit in Claude Code: hooks will inject constraints automatically
2. When starting analysis: call `/brief` or `/lookup` before diving in
3. When discovering patterns: call `/remember` to capture team knowledge
