# Spec: Remove Legacy Content Dump Code
*Date: 2026-04-01 | Status: Draft*

## Problem
`ProjectInitializer._render()` and `_extractBlocks()` are the old code paths that produce 3,000-10,000 line config files. Once the Config Assembler is wired in everywhere, these should be removed to prevent accidental use.

## Solution
After all callers (wizard + legacy init) use `_assembleConfigFile()`:
1. Delete `_extractBlocks()` method
2. Delete `_render()` method
3. Remove the per-tool `switch` statement (12 cases) in `_render()`
4. Remove the `parseSkillFile` import (no longer needed for config generation)

## Safety check before removing
Grep the codebase for calls to `_render()` and `_extractBlocks()`. Both should show zero callers outside the class itself.

## Files Changed
- Modify: `lib/project-initializer.js` — delete ~200 lines of legacy rendering code

## Dependencies
- Spec: Config Assembler (new path must be working)
- Spec: Legacy Init Migration (old callers must be migrated)

This is the LAST spec in the chain. Only implement after verifying all paths use the assembler.
