# MCP Config Generation Design

## Goal

Extend `booklib init` with a Phase 2 that wires up the BookLib MCP server in the user's AI tools — so tools like Cursor, Claude Code, Zed, and others can call booklib's search and context capabilities directly mid-conversation, without leaving the editor.

## Background

`booklib init` currently writes standards docs (CLAUDE.md, .cursor/rules/booklib-standards.mdc, etc.) so AI tools know which coding principles to follow. But the BookLib MCP server (`booklib-mcp`) is never wired up automatically — users have to configure it manually. This means most users never connect the server, missing out on the most powerful booklib capability: live semantic search and context retrieval from within any AI conversation.

## Architecture

### Two-phase init

`booklib init` runs in two sequential phases, each with its own interactive prompt:

**Phase 1 (existing):** Standards docs — which tools get CLAUDE.md / .cursor/rules / etc.

**Phase 2 (new):** MCP setup — opt-in prompt explaining what the MCP server does, then tool selection for which tools to wire up.

Both selections are persisted to `booklib.config.json` (`tools` key for Phase 1, `mcpTools` key for Phase 2) so re-runs skip the prompts.

### Files changed

| File | Change |
|------|--------|
| `package.json` | Add `"booklib-mcp": "bin/booklib-mcp.js"` to the `bin` field |
| `bin/booklib.js` | Add Phase 2 interactive prompt + persistence after existing Phase 1 |
| `lib/project-initializer.js` | Add `generateMcpConfigs(tools)` method with per-tool renderers and merge logic |

No new dependencies. TOML is handled via string templates (not a parser library) — the structure is simple and well-bounded.

### New init targets

Zed and Continue.dev are added as **MCP-only targets** — they don't have a standards-doc format, so they only appear in Phase 2. All other Phase 2 targets (Claude Code, Cursor, Gemini, Codex) already appear in Phase 1.

## Interactive Flow

After Phase 1 writes standards docs, Phase 2 runs immediately:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MCP Server Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  BookLib has an MCP server — your AI tools can call it
  directly to search knowledge, fetch context, and create
  notes without leaving the conversation.

  Wire up the MCP server? (Y/n):
```

If yes:

```
  Which tools should I configure? (select all that apply)

  1. Claude Code → .claude/settings.json
  2. Cursor      → .cursor/mcp.json
  3. Gemini CLI  → .gemini/settings.json
  4. Codex       → .codex/config.toml
  5. Zed         → .zed/settings.json
  6. Continue    → .continue/mcpServers/booklib.yaml
  7. All of the above

  Enter numbers separated by commas (1,2,5) or 7 for all:
```

If the user has a saved `mcpTools` selection in `booklib.config.json`, Phase 2 skips the prompt and uses the saved selection (with a one-line notice). Passing `--mcp-tool=X` on the CLI always overrides.

Windsurf MCP config is global-only (not project-level). If the user selected Windsurf in Phase 1, Phase 2 prints a note explaining this and links to the Windsurf docs — no file is written.

## MCP Config Formats

All configs point to `booklib-mcp` (the new bin entry). Merge behaviour: if the config file already exists, only the `booklib` entry is added/updated — other MCP servers the user has configured are preserved.

### Claude Code — `.claude/settings.json`

```json
{
  "mcpServers": {
    "booklib": {
      "command": "booklib-mcp",
      "args": []
    }
  }
}
```

Merge: parse existing JSON, set `mcpServers.booklib`, write back.

### Cursor — `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "booklib": {
      "command": "booklib-mcp",
      "args": []
    }
  }
}
```

Merge: same as Claude Code.

### Gemini CLI — `.gemini/settings.json`

```json
{
  "mcpServers": {
    "booklib": {
      "command": "booklib-mcp",
      "args": []
    }
  }
}
```

Merge: same pattern.

### Codex — `.codex/config.toml`

```toml
[mcp_servers.booklib]
command = "booklib-mcp"
args = []
```

Merge: read existing file as string. If `[mcp_servers.booklib]` section is absent, append the block. If present, replace the section (match from `[mcp_servers.booklib]` to the next `[` header or end of file) with the fresh block. No TOML parser dependency.

### Zed — `.zed/settings.json`

```json
{
  "context_servers": {
    "booklib-mcp": {
      "command": {
        "path": "booklib-mcp",
        "args": []
      }
    }
  }
}
```

Merge: parse existing JSON, set `context_servers["booklib-mcp"]`, write back.

### Continue.dev — `.continue/mcpServers/booklib.yaml`

```yaml
name: booklib
command: booklib-mcp
args: []
```

BookLib owns this file entirely (named `booklib.yaml` in a dedicated directory) — always overwrite. `mkdirSync` ensures `.continue/mcpServers/` exists.

## Persistence

`booklib.config.json` gains an `mcpTools` key:

```json
{
  "tools": ["claude", "cursor"],
  "mcpTools": ["claude", "cursor", "zed"]
}
```

On re-run:
```
Using saved MCP tool selection: claude, cursor, zed (pass --mcp-tool=X to override)
```

## Error Handling

- JSON parse failure on an existing config: warn the user (`⚠️  Could not parse <file> — skipping merge, writing fresh`), then write a clean file.
- Missing `booklib-mcp` on PATH at runtime: not a concern for config generation — we write the config regardless. If the binary isn't on PATH when the tool tries to connect, the tool will report its own error.

## Testing

- Unit tests in `tests/project-initializer-mcp.test.js`
- One test per tool: write to temp dir, read back, assert correct structure
- Merge tests: pre-populate file with existing MCP server entry, run generator, assert both entries present
- TOML merge test: pre-populate `.codex/config.toml` with unrelated content, assert booklib section appended cleanly
