# Spec: Doctor Diagnostic & Repair
*Date: 2026-03-31 | Status: Draft*

## Problem

`booklib doctor` currently only reports skill usage stats. It doesn't diagnose real problems (208 skills installed, oversized config files, broken installs, stale skills) or fix them.

## Solution

Expand `booklib doctor` into a full diagnostic + repair tool. It runs checks, reports problems with severity, and offers one-command fixes. The wizard's health check delegates to the same diagnostic engine.

## Diagnostic Checks

### Check 1: Slot Overload
- **Condition:** `countInstalledSlots() > SKILL_LIMIT` (32)
- **Severity:** Warning
- **Message:** `⚠ ${count} skills installed (limit: ${SKILL_LIMIT}). Agent context is overloaded.`
- **Fix:** `booklib doctor --cure` removes skills with no usage in the last 30 days, keeping only the top N by usage count. Asks for confirmation before removing.

### Check 2: Oversized Config Files
- **Condition:** CLAUDE.md, copilot-instructions.md, or context.md exceeds 500 lines AND contains `<!-- booklib-standards-start -->`
- **Severity:** Warning
- **Message:** `⚠ ${file} is ${lines} lines. Recommended: under 200.`
- **Fix:** `booklib doctor --cure` regenerates the booklib section using the new profile templates (Spec: Config Profiles). Preserves user content outside the `<!-- booklib-standards -->` markers.

### Check 3: Stale Skills
- **Condition:** Skill installed for 30+ days with zero usage (from `usage.json`)
- **Severity:** Info
- **Message:** `ℹ ${name} — installed ${days} days ago, never used`
- **Fix:** `booklib doctor --cure` suggests removal. Lists all stale skills and asks which to remove.

### Check 4: Missing Index
- **Condition:** vectra index directory doesn't exist or is empty
- **Severity:** Error
- **Message:** `✗ No search index found. Search and recommendations won't work.`
- **Fix:** `booklib doctor --cure` runs `booklib index`.

### Check 5: Missing Config Files
- **Condition:** Tools are saved in `booklib.config.json` but config files don't exist in the project
- **Severity:** Warning
- **Message:** `⚠ ${tool} configured but ${file} not found in project.`
- **Fix:** `booklib doctor --cure` regenerates missing config files.

### Check 6: Orphaned Skills
- **Condition:** Skill directory in `~/.claude/skills/` has `.booklib` marker but skill doesn't exist in any catalog or index
- **Severity:** Info
- **Message:** `ℹ ${name} — not found in any catalog. May be outdated.`
- **Fix:** List for manual review.

## Output Format

```
booklib doctor

  ┌─────────────────────────────────────────┐
  │  BookLib Health Check                    │
  └─────────────────────────────────────────┘

  ✗ No search index found
  ⚠ 208 skills installed (limit: 32)
  ⚠ CLAUDE.md is 3065 lines (recommended: under 200)
  ℹ 12 skills unused for 30+ days

  3 issues found. Run: booklib doctor --cure
```

```
booklib doctor --cure

  ► Fixing: No search index found
    Building index... ✓

  ► Fixing: 208 skills installed
    12 skills unused for 30+ days:
      agent-eval, agent-harness-construction, ...
    Remove these 12? [Y/n] y
    ✓ Removed 12 skills (196 remaining)

  ► Fixing: CLAUDE.md is 3065 lines
    Regenerating BookLib section with software-development profile...
    ✓ CLAUDE.md now 52 lines

  ✓ All issues resolved
```

## Architecture

New module: `lib/engine/doctor.js`
- Exports `runDiagnostics(cwd)` → returns `Array<{ check, severity, message, fix? }>`
- Exports `runCure(cwd, diagnostics)` → executes fixes interactively
- Each check is a pure function: `checkSlotOverload()`, `checkOversizedConfigs(cwd)`, etc.

The wizard calls `runDiagnostics()` for its health check step. The `booklib doctor` CLI command calls both.

## Files Changed

- Create: `lib/engine/doctor.js` — diagnostic engine
- Modify: `bin/booklib.js` — update `case 'doctor':` to use new engine + add `--cure` flag
- Modify: `lib/wizard/index.js` — `stepHealthCheck()` delegates to `runDiagnostics()`
- Create: `tests/engine/doctor.test.js`

Does **not** touch: search pipeline, indexer, parser, graph, MCP.

## Dependency

**Spec: Config Profiles** should be done first (the cure for oversized config files needs the new template system).
