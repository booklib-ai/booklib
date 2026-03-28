# Implementation Plan

Current version: **1.10.0**

## Completed in 1.9.0

- `skills agents` list command
- Cursor support (`--target=cursor` / `--target=all`)
- Hooks: `hooks/suggest.js` + `hooks/hooks.json`
- README overhaul (three-tier architecture)
- AGENTS.md rewrite

## Completed in 1.10.0

- Rules system: `rules/{language}/*.md` always-on standards files
- `skills add --rules` / `skills add --rules=<language>` installs to `.claude/rules/`
- `skills rules` list command
- `skills add --hooks` standalone flag (previously hooks only installed via `--all`)
- CONTRIBUTING.md: "Adding an Agent" section
- `--all` now also installs all rules

## Possible next steps

- `skills add --profile=<name> --rules` to install profile + relevant rules together
- Profile-aware rules: each profile installs matching rules automatically
- `skills rules --info=<language>` for detailed view
- Rules for more languages (Go, Swift, C++)
- Agent evals system
