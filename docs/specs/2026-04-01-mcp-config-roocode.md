# Spec: MCP Config Generation — Roo Code
*Date: 2026-04-01 | Status: Draft*

## Problem
Roo Code has full MCP support (18k+ GitHub stars, 750k+ installs) but BookLib doesn't generate its config.

## Config Format
Project-level `.roo/mcp.json`:
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

## Files Changed
- Modify: `bin/booklib.js` — add `roo-code` target to MCP setup
- Modify: MCP config writer to handle `.roo/mcp.json`

## No Dependencies
