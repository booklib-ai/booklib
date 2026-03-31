# Spec: Legacy Init Path Migration
*Date: 2026-04-01 | Status: Draft*

## Problem
`booklib init --skills=springboot-patterns,...` uses the legacy `_render()` path which dumps raw XML blocks, producing 10,000-line config files. This is the path the agent used in testing and it created a 10,595-line CLAUDE.md.

## Solution
Make the legacy `--skills=` path use `_assembleConfigFile()` with the saved profile (from `booklib.config.json`) or default `software-development`.

## Change
In `bin/booklib.js`, inside the legacy init block (around line 629), where `initializer.init()` is called:

```js
const written = await initializer.init({ 
  skills: effectiveSkills, 
  target: targetArg, 
  dryRun,
  profile: savedConfig.profile ?? 'software-development',  // NEW
  stack: savedConfig.stack ?? '',                           // NEW
});
```

That's it. The `init()` method already routes to `_assembleConfigFile()` when `profile` is provided (from Spec: Config Assembler).

## Files Changed
- Modify: `bin/booklib.js` — pass `profile` and `stack` to `initializer.init()` in legacy path

## Dependencies
- Spec: Config Assembler (must be done first)
