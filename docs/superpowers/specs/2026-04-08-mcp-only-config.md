# MCP-Only Configuration — Design Spec

## Goal

BookLib's only footprint in a project is MCP server registration + hooks. No text instructions, no instinct blocks, no skills tables, no content dumped into CLAUDE.md or any agent config file.

## Problem

Current state: `booklib init` writes 20-30 lines of text instructions (instinct block + skills table + references) into CLAUDE.md, .gemini/context.md, .github/copilot-instructions.md, .kiro/steering/booklib-standards.md, and more. This wastes agent context budget and duplicates what MCP tool descriptions already provide.

Target state: BookLib writes ONE thing per tool — the MCP server registration in that tool's native config format. The agent discovers BookLib tools via MCP protocol, not via text instructions.

## What BookLib Writes

### Per tool — MCP server registration only

| Tool | Config file | What gets written |
|------|------------|-------------------|
| Claude Code | via `claude mcp add` CLI | MCP server entry pointing to `booklib-mcp` |
| Cursor | `.cursor/mcp.json` | `{ "mcpServers": { "booklib": { "command": "booklib-mcp" } } }` |
| Copilot | `.github/copilot-mcp.json` | MCP server entry per Copilot spec |
| Gemini CLI | `.gemini/settings.json` | MCP server entry per Gemini spec |
| Codex | `.codex/config.toml` | MCP server entry per Codex spec |
| Windsurf | `.windsurf/mcp.json` | MCP server entry per Windsurf spec |
| Roo Code | `.roo/mcp.json` | MCP server entry per Roo spec |
| Goose | `.goose/config.yaml` | MCP server entry per Goose spec |
| Zed | `.zed/settings.json` | MCP server entry per Zed spec |
| Continue | `.continue/mcpServers/booklib.yaml` | MCP server entry per Continue spec |

### Claude Code hooks — `.claude/settings.json`

Hooks are functional (run code), not instructional. They stay:

- `PreToolUse` → `hooks/pretooluse-inject.mjs` (context injection before Write/Edit)
- `PostToolUse` → `hooks/posttooluse-contradict.mjs` (contradiction detection after Write/Edit)
- `PostToolUse` → `hooks/posttooluse-imports.mjs` (import checking after Write/Edit)
- `PostToolUse` → `hooks/posttooluse-capture.mjs` (knowledge capture after WebFetch/WebSearch)

### `.booklib/` directory

BookLib's own data — unchanged:
- `index/` — vector index
- `bm25.json` — lexical index
- `knowledge/` — captured nodes and graph
- `sources.json` — connected sources
- `context-map.json` — runtime injection map
- `booklib.config.json` — project config (profile, processing mode, skills)

## What BookLib Stops Writing

| Removed | Was in | Why |
|---------|--------|-----|
| Instinct block (5 lines of "when X → tool Y") | CLAUDE.md, .gemini/context.md, copilot-instructions.md, .kiro, etc. | MCP tool descriptions handle this |
| Skills table (markdown table of active skills) | Same files | Agent discovers skills via `lookup` tool |
| References section (links to docs) | Same files | Not needed — booklib-mcp-guide skill exists |
| `<!-- booklib-standards-start/end -->` markers | Same files | No content to mark |
| Stack/Commands section | Same files | Agent can run `booklib --help` |
| Navigation map | CLAUDE.md | Agent uses `lookup` to find skills |
| Corrections block | CLAUDE.md | Corrections still work via CLI, don't need CLAUDE.md |

## Config File Behavior

### If the file doesn't exist
Create a minimal skeleton with just the MCP entry. Examples:

**CLAUDE.md (doesn't exist):** Don't create it. Claude Code doesn't need a CLAUDE.md for MCP — `claude mcp add` handles registration separately.

**`.cursor/mcp.json` (doesn't exist):**
```json
{
  "mcpServers": {
    "booklib": {
      "command": "booklib-mcp"
    }
  }
}
```

### If the file already exists
- **MCP config files** (`.cursor/mcp.json`, `.gemini/settings.json`, etc.): Merge the booklib server entry into the existing servers object. Don't touch other servers.
- **CLAUDE.md / other text files**: If `<!-- booklib-standards-start -->` markers exist, remove the entire marked section (cleanup old BookLib content). Don't add anything new.
- **`.claude/settings.json`**: Merge hooks into existing hooks array. Don't touch other settings.

### Merge strategy
For JSON configs: parse → add `booklib` key to `mcpServers` → write back. If `booklib` key already exists, update it.
For YAML configs: same approach via yaml parse → merge → write.
For TOML configs: same approach.

## What Gets Removed From Codebase

### Files to delete
- None (instinct-block.js still used for non-MCP tools via CLI fallback? — see below)

### Functions to remove/simplify
| Function | File | Action |
|----------|------|--------|
| `renderInstinctBlock()` | `lib/instinct-block.js` | Remove MCP branch. Keep CLI-only branch for non-MCP tools (junie, openhands, letta) |
| `_renderFromProfile()` | `lib/project-initializer.js` | Remove profile template system. Replace with MCP-only registration |
| `_buildSkillTable()` | `lib/project-initializer.js` | Remove entirely |
| `_loadProfile()` | `lib/project-initializer.js` | Remove — no more profile templates |
| Profile template files | `lib/profiles/*.md` | Remove all profile templates |

### Config files to clean up (in BookLib's own repo)
Remove BookLib-generated content from:
- `CLAUDE.md` — reduce to project-specific content only (no BookLib section)
- `.kiro/steering/booklib-standards.md` — remove or keep only non-BookLib content
- `.gemini/context.md` — remove BookLib section
- `.github/copilot-instructions.md` — remove BookLib section
- `SETUP.md` — update to reflect MCP-only approach
- `BOOKLIB_SETUP_SUMMARY.md` — update to reflect MCP-only approach

## Wizard Flow Changes

Current steps that change:

### Step: "Writing config files"
**Before:** Writes CLAUDE.md content + MCP config + hooks for each selected tool.
**After:** Writes ONLY MCP config + hooks for each selected tool. No text content.

### Step: "Wiring everything up" spinner message
Stays the same — the user sees the same friendly message. What happens behind the scenes is simpler.

### Summary at end
**Before:** Lists config files written (CLAUDE.md, .cursor/rules/booklib-standards.mdc, etc.)
**After:** Lists MCP registrations made ("Claude Code: MCP registered", "Cursor: .cursor/mcp.json updated")

## Agent Discovery Flow (New)

```
Agent starts → MCP protocol → discovers 5 tools (lookup, review, remember, verify, guard)
                                   ↓
Agent reads tool descriptions → knows when to call each
                                   ↓
Agent calls lookup("booklib mcp tools") → gets full skill guide (on demand)
                                   ↓
Hooks fire automatically on Write/Edit → context injected, decisions guarded
```

No text instructions needed at any point.

## Non-MCP Tools

For tools that don't support MCP (OpenHands, Junie, Letta), the wizard writes a minimal instruction-file with CLI commands:

```markdown
## BookLib
Run `booklib search "query"` for relevant principles.
Run `booklib capture --title "..." --type decision` to save knowledge.
Run `booklib doctor` for health check.
```

This is the only case where BookLib writes text instructions. It's 3 lines, not 30.

## Validation

After implementation:
1. `booklib init` on a fresh project creates ONLY `.booklib/`, MCP configs, and hooks — no CLAUDE.md content
2. `booklib init` on a project with existing CLAUDE.md cleans up old `<!-- booklib-standards -->` block
3. `booklib init --reset` removes old content and re-registers MCP
4. An MCP-capable agent discovers all 5 tools without any text instructions
5. `npm test` passes
6. Hooks still fire on Write/Edit in Claude Code
