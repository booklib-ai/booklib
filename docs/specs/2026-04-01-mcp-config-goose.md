# Spec: MCP Config Generation — Goose
*Date: 2026-04-01 | Status: Draft*

## Problem
Goose (Linux Foundation / Block) has full MCP support but uses its own YAML config format.

## Config Format
Goose uses `~/.config/goose/config.yaml` or project-level `.goose/config.yaml`:
```yaml
mcp_servers:
  booklib:
    command: booklib-mcp
    args: []
```

## Special Handling
- YAML format (not JSON) — use string concatenation or a YAML library
- Must merge with existing `mcp_servers` section
- Check both global and project-level paths

## Files Changed
- Modify: `bin/booklib.js` — add `goose` target to MCP setup
- Modify: MCP config writer to handle YAML format

## No Dependencies
