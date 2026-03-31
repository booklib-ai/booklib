# Spec: MCP Config Generation — Copilot (VS Code)
*Date: 2026-04-01 | Status: Draft*

## Problem
GitHub Copilot in VS Code supports MCP (GA since July 2025) but BookLib doesn't generate the config for it. Copilot uses `.vscode/mcp.json` with a `"servers"` root key — different from all other tools which use `"mcpServers"`.

## Solution
Add Copilot/VS Code MCP config generation to `booklib mcp setup`.

## Config Format
```json
{
  "servers": {
    "booklib": {
      "command": "booklib-mcp",
      "args": []
    }
  }
}
```

Note: root key is `"servers"`, NOT `"mcpServers"`.

## Files Changed
- Modify: `bin/booklib.js` — add `vscode` target to MCP setup command
- Modify: MCP config writer to handle `.vscode/mcp.json` with `servers` root key

## No Dependencies
Can be implemented independently.
