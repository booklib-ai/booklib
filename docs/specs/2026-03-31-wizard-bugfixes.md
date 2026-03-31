# Spec: Wizard Remaining Bugfixes
*Date: 2026-03-31 | Status: Draft*

## Problem

Several small bugs remain in the wizard from the last test run.

## Bugs

### Bug 1: Health check never triggers

`stepHealthCheck()` is defined in the wizard but the condition `slotsUsed > SKILL_LIMIT` uses `countInstalledSlots()`. With 208 skills and SKILL_LIMIT=32, this should trigger. Verify the function is actually called in the flow and that `countInstalledSlots()` returns the right number at that point.

### Bug 2: Double config file printing

The wizard output shows both `✅` (from `ProjectInitializer.init()` which calls `console.log`) AND `✓` (from the wizard's own loop). The wizard prints its own checkmarks, but `ProjectInitializer.init()` ALSO prints at line 99: `console.log(\`  ✅ ${filePath}\`)`. This results in:
```
  ✅ CLAUDE.md
  ✅ .github/copilot-instructions.md
  ✅ .gemini/context.md
  ✓ CLAUDE.md
  ✓ .github/copilot-instructions.md
  ✓ .gemini/context.md
```

Fix: Either suppress `ProjectInitializer` logging when called from the wizard (pass a `quiet` option), or remove the wizard's own loop and let `ProjectInitializer` handle output.

### Bug 3: "10 new skill(s) added" when all failed

The wizard shows `✓ 10 new skill(s) added` in the summary even though all 10 install attempts failed with `✗`. The `selectedSkills` array is populated based on selected indices, not successful installs. The count should reflect actual successful installs only.

### Bug 4: First run hit relevance audit instead of setup

When the user ran `rm -rf webshop/.booklib && booklib init`, the first attempt ran `runRelevanceAudit` instead of `runSetup`. This happened because the user typed `rm -rf webshop/.booklib` while already IN the webshop directory — removing a non-existent nested path. The `.booklib/initialized` marker survived. This is a user error, not a code bug — but the wizard should print a clearer message when it detects the marker:
```
  BookLib is already initialized in this project.
  Running relevance check... (to re-run setup: rm -rf .booklib && booklib init)
```

## Files Changed

- Modify: `lib/wizard/index.js` — fix bugs 1, 3, 4
- Modify: `lib/project-initializer.js` — add `quiet` option for bug 2

## No Dependencies

Can be implemented independently of all other specs.
