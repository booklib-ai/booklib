# Spec: Activity-Based Config Profiles
*Date: 2026-03-31 | Status: Draft*

## Problem

`ProjectInitializer._render()` generates tool config files by dumping raw SKILL.md XML blocks (3000+ lines). The files are unusable — too long, not project-specific, no structure.

## Solution

Replace content generation with **activity-based profile templates**. A profile defines the SECTION STRUCTURE of the config file (headings, placeholder comments, reference links), not the content. The user fills in their specifics. BookLib auto-fills: stack info, active skills table, and agent behavior instructions.

## Profiles

Five activity profiles, matched by the wizard from the user's project description:

### 1. `software-development` (default)
Sections: Overview, Stack, Conventions, Architecture Decisions, Testing, PR Workflow, BookLib Agent Behaviors, Active Skills, References.

### 2. `writing-content`
Sections: Overview, Audience, Tone & Style, Format Preferences, Sources & Research, BookLib Agent Behaviors, Active Skills, References.

### 3. `research-analysis`
Sections: Overview, Research Questions, Methodology, Sources, Citation Style, Output Format, BookLib Agent Behaviors, Active Skills, References.

### 4. `design`
Sections: Overview, Design System, Component Patterns, Accessibility, Brand Guidelines, BookLib Agent Behaviors, Active Skills, References.

### 5. `general`
Sections: Overview, Goals, Preferences, BookLib Agent Behaviors, Active Skills, References.

## Profile Storage

Each profile is a template file at `lib/profiles/<name>.md` containing the section structure with `<!-- placeholder -->` comments. The template uses `{{stack}}`, `{{skills_table}}`, `{{agent_behaviors}}` variables that `ProjectInitializer` fills in at generation time.

## Profile Selection

The wizard asks the user in step 2 (after project detection):

```
► What kind of work is this project for?

  1. Software development (default)
  2. Writing & content
  3. Research & analysis
  4. Design
  5. General / other

  [1-5 or Enter for default]:
```

Selection is saved to `booklib.config.json` as `"profile": "software-development"`.

## Per-Tool Rendering

Each tool gets the same profile content, with minor format adjustments:

| Tool | Format |
|------|--------|
| CLAUDE.md | Full markdown, `<!-- booklib-standards-start -->` markers |
| .cursor/rules/booklib.mdc | Frontmatter with `alwaysApply: true` + content |
| .github/copilot-instructions.md | Markdown, no CLI command references |
| .gemini/context.md | Markdown with `# Project Context` header |
| AGENTS.md | Same as CLAUDE.md |
| Others | Same as CLAUDE.md with tool-specific header |

Copilot and Gemini files omit CLI commands (the agent can't run them) and instead describe the skill focus areas in plain text.

## Target Config File Size

Each generated file: **40-80 lines**. Skeleton sections with placeholder comments, auto-filled skills table, agent behaviors block, and reference links. Not 3000 lines.

## Files Changed

- Create: `lib/profiles/software-development.md`
- Create: `lib/profiles/writing-content.md`
- Create: `lib/profiles/research-analysis.md`
- Create: `lib/profiles/design.md`
- Create: `lib/profiles/general.md`
- Rewrite: `lib/project-initializer.js` — `_render()` and `_extractBlocks()` replaced with template-based generation
- Modify: `lib/wizard/index.js` — add profile selection step
- Modify: `booklib.config.json` schema — add `profile` field

Does **not** touch: search pipeline, indexer, parser, CLI commands, graph, MCP.
