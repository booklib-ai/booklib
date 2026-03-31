# Spec: Wizard UI with @clack/prompts
*Date: 2026-03-31 | Status: Draft*

## Problem

The wizard uses raw `process.stdout.write` for all UI — no colors, no spinners, no arrow-key selection, no visual grouping. It looks like a 1990s installer compared to modern CLIs like `create-next-app`, `astro init`, or `svelte-kit create`.

## Solution

Migrate the wizard to `@clack/prompts` — a minimal library (3 total deps, ~30KB) that provides beautiful CLI prompts with colors, spinners, and keyboard navigation. Used by Astro, SvelteKit, and other modern tools.

## New Dependency

```json
"@clack/prompts": "^1.1.0"
```

Total added: 3 packages (`@clack/prompts`, `@clack/core`, `sisteransi`). ~30KB.

## Visual Design

### Banner + Intro
```
  ┌──────┬──────┐ ✦
  │ ───  │ ───  │
  │ ──   │ ──   │  BookLib
  │ ───  │ ───  │
  │ ──   │ ──   │  AI-agent skills from
  │ ───  │ ───  │  expert knowledge
  └──────┴──────┘

◆  What are you building?
│  Auto-detected: React, Spring Boot
│
```

### Confirm
```
◇  Correct?
│  Yes
```

### Profile Selection (from Spec: Config Profiles)
```
◆  What kind of work?
│  ● Software development (default)
│  ○ Writing & content
│  ○ Research & analysis
│  ○ Design
│  ○ General
```

### Tool Selection (arrow keys + space to toggle)
```
◆  Which AI tools do you use?
│  ◻ Claude Code (detected)
│  ◻ Copilot (detected)
│  ◻ Gemini CLI (detected)
│  ◻ Cursor
│  ◻ Codex
│  ◻ Windsurf
│  ◻ Roo Code
│  ◻ OpenHands
│  ...
```

Pre-checks detected tools. User toggles with space, confirms with enter.

### Health Check (styled warnings)
```
▲  208 skills installed (limit: 32)
│  Your agent's context is overloaded — most skills get truncated.
│  After indexing, I'll help you clean up.
```

### Index Build (animated spinner)
```
◒  Building knowledge index... [47/249] effective-kotlin
```

Uses `@clack/prompts` `spinner()` with updating message text.

### Skill Recommendations (multi-select with scores)
```
◆  Top skills for your project:
│  ◻ springboot-security [92%] — auth patterns, CSRF
│  ◻ bulletproof-react [87%] — feature folders, SoC
│  ◻ effective-java [71%] — generics, builder pattern
│  ◻ clean-code-reviewer [65%] — naming, functions, SRP
│  ...
```

### Cleanup Offer
```
◆  You have 208 skills but only need ~10.
│  ● Clean up — keep only recommended (remove 198)
│  ○ Keep all + add recommended
│  ○ Skip — I'll handle it manually
```

### Config Files
```
◇  Writing config files...
│  ✓ CLAUDE.md
│  ✓ .github/copilot-instructions.md
│  ✓ .gemini/context.md
```

### Summary
```
└  BookLib is ready

   ✓ 4 skills installed
   ✓ 12 total skills loaded

   booklib search "query"    find patterns
   booklib doctor             check health
   booklib scan               project analysis
```

## @clack/prompts API Mapping

| Current wizard | @clack/prompts equivalent |
|---------------|--------------------------|
| `session.confirm()` | `clack.confirm({ message })` |
| `session.readText()` | `clack.text({ message, placeholder })` |
| `session.multiSelect()` | `clack.multiselect({ message, options })` |
| `session.numberedInput()` | `clack.multiselect()` with pre-selected |
| ASCII spinner | `clack.spinner()` |
| `process.stdout.write(color)` | `clack.log.info()`, `clack.log.warn()`, `clack.log.error()` |
| `console.log(banner)` | `clack.intro(bannerText)` |
| summary | `clack.outro(message)` |

## Color Scheme

Match the BookLib brand from `docs/index.html` and `assets/logo.svg`:

| Element | Color | ANSI |
|---------|-------|------|
| Prompts / headings | White bold | default clack |
| Success | Green | `✓` in green |
| Warnings | Yellow/amber | `▲` in yellow |
| Errors | Red | `✗` in red |
| Dim/secondary | Gray | dim text |
| Scores ≥70% | Green | |
| Scores 40-69% | Yellow | |
| Scores <40% | Red/dim | |

## Migration Strategy

Replace the custom `createSession()` in `lib/wizard/prompt.js` with a thin wrapper around `@clack/prompts`. The wrapper exists so:
1. Tests can still use fake stdin (clack doesn't support this directly)
2. The rest of the codebase doesn't import clack directly

```js
// lib/wizard/prompt.js
import * as clack from '@clack/prompts';

export function createWizardUI() {
  return {
    intro: clack.intro,
    outro: clack.outro,
    confirm: (msg, initial) => clack.confirm({ message: msg, initialValue: initial }),
    text: (msg, placeholder) => clack.text({ message: msg, placeholder }),
    select: (msg, options) => clack.select({ message: msg, options }),
    multiselect: (msg, options) => clack.multiselect({ message: msg, options }),
    spinner: () => clack.spinner(),
    log: clack.log,
    isCancel: clack.isCancel,
  };
}
```

## Cancellation Handling

`@clack/prompts` returns a `Symbol` when the user presses Ctrl+C. Every prompt call must check:

```js
const result = await ui.confirm('Continue?');
if (clack.isCancel(result)) {
  ui.outro('Setup cancelled.');
  process.exit(0);
}
```

## Files Changed

- Modify: `package.json` — add `@clack/prompts` dependency
- Rewrite: `lib/wizard/prompt.js` — replace raw readline with clack wrapper
- Rewrite: `lib/wizard/index.js` — use clack UI throughout
- Modify: `tests/wizard/prompt-session.test.js` — adapt to new API

Does **not** touch: search pipeline, indexer, CLI commands outside wizard, graph, MCP.

## Dependencies

Should be implemented **after** Spec: Wizard Bugfixes (F) and **after** Spec: Config Profiles (A), so the wizard flow is stable before reskinning.

## Recommended Implementation Order

1. Install `@clack/prompts`
2. Rewrite `prompt.js` with clack wrapper
3. Rewrite wizard `index.js` step by step (banner → project detect → health check → tools → index → recommend → config → summary)
4. Update tests
5. Manual smoke test
