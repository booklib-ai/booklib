# Spec: Wizard MCP Auto-Setup
*Date: 2026-04-01 | Status: Draft*

## Problem
The wizard detects AI tools and writes config files, but doesn't set up MCP servers. Users have to run `booklib mcp setup` separately — most won't know to do this.

## Solution
After tool detection in the wizard, automatically write MCP configs for all MCP-capable detected tools. No separate step needed.

## Which tools get MCP
```js
const MCP_CAPABLE = new Set([
  'claude', 'cursor', 'copilot', 'gemini', 'codex',
  'windsurf', 'roo-code', 'goose', 'zed', 'continue',
]);
```

## Wizard flow change
In `stepWriteConfigs()`, after writing the config file for each tool, also write the MCP config if the tool is MCP-capable:

```js
for (const tool of selectedAgents) {
  // Write config file (profile + instinct + table)
  // ...existing code...
  
  // Write MCP config if capable
  if (MCP_CAPABLE.has(tool)) {
    writeMCPConfig(tool, cwd);
  }
}
```

## MCP config paths (from research)
| Tool | Path | Format |
|------|------|--------|
| claude | `.claude/settings.json` → `mcpServers` | JSON merge |
| cursor | `.cursor/mcp.json` → `mcpServers` | JSON merge |
| copilot | `.vscode/mcp.json` → `servers` | JSON merge |
| gemini | `.gemini/settings.json` → `mcpServers` | JSON merge |
| codex | `.codex/config.toml` → `[mcp_servers]` | TOML append |
| windsurf | `~/.codeium/windsurf/mcp_config.json` → `mcpServers` | JSON merge (global) |
| roo-code | `.roo/mcp.json` → `mcpServers` | JSON merge |
| goose | `.goose/config.yaml` → `mcp_servers` | YAML merge |
| zed | `.zed/settings.json` → `context_servers` | JSON merge |
| continue | `.continue/mcpServers/booklib.yaml` | YAML file |

## Output
```
► Setting up MCP server for your tools...
  ✓ .claude/settings.json (MCP)
  ✓ .vscode/mcp.json (MCP)
  ✓ .gemini/settings.json (MCP)
```

## Files Changed
- Create: `lib/mcp-config-writer.js` — exports `writeMCPConfig(tool, cwd)` for all 10 formats
- Modify: `lib/wizard/index.js` — call `writeMCPConfig` in config step

## Dependencies
- Specs: MCP Config Copilot, Roo Code, Windsurf, Goose (for the new config formats)
- Can start with existing 6 tools (Claude, Cursor, Gemini, Codex, Zed, Continue) and add the 4 new ones later
