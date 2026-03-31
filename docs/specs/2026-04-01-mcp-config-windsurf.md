# Spec: MCP Config Generation — Windsurf
*Date: 2026-04-01 | Status: Draft*

## Problem
Windsurf has full MCP support but uses a GLOBAL config (not project-level): `~/.codeium/windsurf/mcp_config.json`.

## Config Format
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

## Special Handling
- Config is global (`~/.codeium/windsurf/`), not project-level
- Must merge with existing servers (user may have others configured)
- Warn user: "Windsurf MCP config is global — BookLib will be available in all Windsurf projects"

## Files Changed
- Modify: `bin/booklib.js` — add `windsurf` target to MCP setup with global path
- Modify: MCP config writer to handle global path + merge

## No Dependencies
