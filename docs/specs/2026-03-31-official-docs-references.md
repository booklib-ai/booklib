# Spec: Official Documentation References in Config Files
*Date: 2026-03-31 | Status: Draft*

## Problem

Generated config files (CLAUDE.md, copilot-instructions.md, etc.) don't link to the official documentation for how to customize them. Users get a BookLib-generated skeleton but no guidance on how to extend it for their own project.

## Solution

Every generated config file includes a **References** section at the bottom with links to:

1. The official documentation for that specific tool's config file format
2. BookLib's own documentation
3. Relevant community resources

## Reference Links Per Tool

| Tool | Config File | Official Docs |
|------|------------|---------------|
| Claude Code | `CLAUDE.md` | https://docs.anthropic.com/en/docs/claude-code/claude-md |
| Cursor | `.cursor/rules/*.mdc` | https://docs.cursor.com/context/rules-for-ai |
| Copilot | `.github/copilot-instructions.md` | https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions |
| Gemini CLI | `.gemini/context.md` | https://github.com/google-gemini/gemini-cli#configuration |
| Codex | `AGENTS.md` | https://github.com/openai/codex#agents-md |
| Windsurf | `.windsurfrules` | https://docs.windsurf.com/windsurf/customize |
| Roo Code | `.roo/rules/*.md` | https://docs.roocode.com/features/custom-rules |
| OpenHands | `.openhands/instructions.md` | https://docs.all-hands.dev/usage/configuration |
| Junie | `.junie/guidelines.md` | https://www.jetbrains.com/help/junie/guidelines |
| Goose | `.goose/context.md` | https://block.github.io/goose/docs/configuration |
| OpenCode | `opencode.toml` | https://github.com/opencode-ai/opencode#configuration |
| Letta | `.letta/instructions.md` | https://docs.letta.com/agents/custom-instructions |

## Generated Section

Each config file gets this footer:

```markdown
## References

- [How to customize this file]({{tool_docs_url}})
- [BookLib documentation](https://booklib-ai.github.io/skills/)
- [BookLib skills catalog](https://github.com/booklib-ai/skills)
```

## Implementation

Add a `TOOL_DOCS` map to `lib/project-initializer.js` mapping tool targets to their official docs URL. The `_render()` method appends the references section to every generated file.

## Files Changed

- Modify: `lib/project-initializer.js` — add `TOOL_DOCS` map and references section to `_render()`

Does **not** touch: wizard, search, indexer, doctor.

## No Dependencies

Can be implemented independently. Benefits from **Spec: Config Profiles** (references become part of the template) but works without it.
