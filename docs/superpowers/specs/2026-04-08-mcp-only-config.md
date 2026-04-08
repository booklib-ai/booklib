# MCP-Only Configuration — Design Spec

## Goal

BookLib's footprint in a project is: MCP server registration + one line pointing to the guide skill + hooks. No instinct blocks, no skills tables, no content dumps.

## Problem

Current state: `booklib init` writes 20-30 lines of text instructions (instinct block + skills table + references) into CLAUDE.md, .gemini/context.md, .github/copilot-instructions.md, .kiro/steering/booklib-standards.md, and more. This wastes agent context budget and duplicates what MCP tool descriptions already provide.

Target state: BookLib writes three things per tool — MCP server registration, one line pointing to the guide skill, and (for Claude Code) hooks. The agent discovers tools via MCP protocol and learns usage from the skill.

## Architecture: Two Independent Layers

**MCP layer (functional):** 5 tools registered via MCP protocol. Tool descriptions are self-contained — they work even if the skill is deleted. The agent sees tool names + descriptions automatically.

**Skill layer (teaching):** `booklib-mcp-guide` skill installed during wizard init. Contains decision tree, workflows, anti-patterns, parameter details. Loaded on demand when the agent reads it. One line in agent config files points to it.

These layers are independent. MCP works without the skill. The skill makes MCP usage better.

## What BookLib Writes Per Tool

### 1. MCP server registration

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

### 2. One line in the agent's instruction file

Each MCP-capable tool has an instruction file the agent reads. BookLib adds exactly one line:

| Tool | Instruction file | Line added |
|------|-----------------|------------|
| Claude Code | `CLAUDE.md` | `BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.` |
| Cursor | `.cursor/rules/booklib.mdc` | Same one line |
| Copilot | `.github/copilot-instructions.md` | Same one line |
| Gemini CLI | `.gemini/context.md` | Same one line |
| Kiro | `.kiro/steering/booklib.md` | Same one line |
| Windsurf | `.windsurf/rules/booklib.md` | Same one line |
| Roo Code | `.roo/rules/booklib.md` | Same one line |

### 3. Claude Code hooks — `.claude/settings.json`

Hooks are functional (run code), not instructional. They stay:

- `PreToolUse` → `hooks/pretooluse-inject.mjs` (context injection before Write/Edit)
- `PostToolUse` → `hooks/posttooluse-contradict.mjs` (contradiction detection after Write/Edit)
- `PostToolUse` → `hooks/posttooluse-imports.mjs` (import checking after Write/Edit)
- `PostToolUse` → `hooks/posttooluse-capture.mjs` (knowledge capture after WebFetch/WebSearch)

### 4. `booklib-mcp-guide` skill installation

During wizard init, the skill gets installed into the project's skills directory and indexed. This happens once alongside the MCP registration. The skill is ~130 lines and teaches proper tool usage.

### 5. `.booklib/` directory

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
| Instinct block (5 lines of "when X → tool Y") | CLAUDE.md, .gemini/context.md, copilot-instructions.md, etc. | One line + skill handles this |
| Skills table (markdown table of active skills) | Same files | Agent discovers skills via `lookup` tool |
| References section (links to docs) | Same files | Not needed — skill exists |
| `<!-- booklib-standards-start/end -->` markers | Same files | One line needs no markers |
| Stack/Commands section | Same files | Agent can run `booklib --help` |
| Navigation map | CLAUDE.md | Agent uses `lookup` to find skills |
| Corrections block | CLAUDE.md | Corrections still work via CLI |
| Profile template rendering | CLAUDE.md and others | Replaced by one line |

## Config File Behavior

### Agent instruction files (CLAUDE.md, copilot-instructions.md, etc.)

**File doesn't exist:**
Create minimal file with just the one line:
```markdown
BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.
```

**File exists, has old `<!-- booklib-standards-start -->` markers:**
Remove the entire marked section. Add the one line at the end.

**File exists, no markers:**
Append the one line at the end.

**File exists, already has the BookLib line:**
Do nothing.

### MCP config files (.cursor/mcp.json, .gemini/settings.json, etc.)

**File doesn't exist:**
Create minimal skeleton with just the MCP entry.

**File exists:**
Merge the booklib server entry into existing servers object. Don't touch other servers.

### Hooks config (`.claude/settings.json`)

**File doesn't exist:**
Create with hooks array.

**File exists:**
Merge hooks into existing hooks array. Don't touch other settings.

## What Gets Removed From Codebase

### Functions to remove/simplify
| Function | File | Action |
|----------|------|--------|
| `renderInstinctBlock()` | `lib/instinct-block.js` | Remove MCP branch entirely. Keep 3-line CLI branch for non-MCP tools only |
| `_renderFromProfile()` | `lib/project-initializer.js` | Remove profile template system. Replace with: write one line + install skill |
| `_buildSkillTable()` | `lib/project-initializer.js` | Remove entirely |
| `_loadProfile()` | `lib/project-initializer.js` | Remove — no more profile templates |
| Profile template files | `lib/profiles/*.md` | Remove all profile templates |

### Config files to clean up (in BookLib's own repo)
- `CLAUDE.md` — replace with one line (BookLib is also a BookLib-managed project)
- `.kiro/steering/booklib-standards.md` — replace content with one line
- `.gemini/context.md` — replace BookLib section with one line
- `.github/copilot-instructions.md` — replace BookLib section with one line
- `SETUP.md` — update to reflect new approach
- `BOOKLIB_SETUP_SUMMARY.md` — update to reflect new approach

## Wizard Flow Changes

### Step: "Wiring everything up"
**Before:** Writes CLAUDE.md content (20-30 lines) + MCP config + hooks per tool.
**After:** Three actions per tool:
1. Register MCP server (tool-specific config)
2. Install `booklib-mcp-guide` skill (copy + index)
3. Write one line to agent instruction file
Plus hooks for Claude Code.

### Summary at end
**Before:** Lists config files written (CLAUDE.md, .cursor/rules/booklib-standards.mdc, etc.)
**After:** Lists what was done:
```
Claude Code: MCP registered, hooks installed
Cursor: .cursor/mcp.json updated
Copilot: .github/copilot-instructions.md updated
booklib-mcp-guide skill installed
```

## Agent Discovery Flow

```
Agent starts
  ↓
Reads instruction file → sees one line: "BookLib tools available. Read SKILL.md"
  ↓
Reads skills/booklib-mcp-guide/SKILL.md → learns decision tree, workflows, anti-patterns
  ↓
MCP protocol → sees 5 tools (lookup, review, remember, verify, guard)
  ↓
Agent knows WHEN to call (from skill) and WHAT to call (from MCP)
  ↓
Hooks fire automatically on Write/Edit → context injected, decisions guarded
```

## Non-MCP Tools

For tools that don't support MCP (OpenHands, Junie, Letta), the wizard writes a minimal instruction-file with CLI commands:

```markdown
BookLib: knowledge tools for this project.
Run `booklib search "query"` for relevant principles.
Run `booklib capture --title "..." --type decision` to save knowledge.
```

This is the only case where BookLib writes more than one line. It's 3 lines, not 30.

## Validation

After implementation:
1. `booklib init` on a fresh project creates: `.booklib/`, MCP configs, one line per instruction file, hooks, skill installed
2. `booklib init` on a project with old markers cleans up old block, adds one line
3. MCP-capable agent discovers 5 tools without text instructions
4. Agent reads the skill and understands proper usage
5. Deleting the skill doesn't break MCP — tools still work via descriptions
6. `npm test` passes
7. Hooks still fire on Write/Edit in Claude Code

## Note: skill-router

`skill-router` is the old system for routing between book-based skills (effective-kotlin, clean-code-reviewer, etc.). It predates the MCP-first architecture. It still works but is not part of the MCP discovery flow described here. We will revisit whether skill-router is still needed in a future iteration.
