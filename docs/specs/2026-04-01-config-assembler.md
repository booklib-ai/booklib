# Spec: Config File Assembler
*Date: 2026-04-01 | Status: Draft*

## Problem
`ProjectInitializer._render()` dumps raw SKILL.md XML blocks into config files (3,000-10,000 lines). Need to replace with clean assembly: profile template + instinct block + skill table + references.

## Solution
New method `_assembleConfigFile(target, skillNames, opts)` that combines four components into a final config file of 30-60 lines.

## Assembly Order
```
┌─────────────────────────────────────────┐
│  Profile template (section headings)    │  ← from lib/profiles/<name>.md
│  ## Overview                            │
│  ## Stack: {{stack}}                    │
│  ## Conventions                         │
│  ...                                    │
├─────────────────────────────────────────┤
│  <!-- booklib-standards-start -->       │
│  Instinct block (5-10 lines)            │  ← from instinct-block.js
│  Skill table (N lines)                  │  ← from _buildSkillTable()
│  References (3 lines)                   │  ← from TOOL_DOCS map
│  <!-- booklib-standards-end -->         │
└─────────────────────────────────────────┘
```

## API
```js
_assembleConfigFile(target, skillNames, { profile, stack }) {
  const profileContent = this._loadProfile(profile);   // from Spec A
  const instinctBlock = renderInstinctBlock(target);    // from instinct-block.js
  const skillTable = this._buildSkillTable(skillNames); // from Spec H
  const references = this._getReferences(target);       // from Spec G
  
  // Fill profile template variables
  let content = profileContent
    .replace('{{stack}}', stack || '<!-- describe your stack -->')
    .replace('{{skills_table}}', skillTable)
    .replace('{{agent_behaviors}}', instinctBlock)
    .replace('{{references}}', references);
  
  return content;
}
```

## What this replaces
- `_render()` method — the old per-tool switch statement with content dumps
- `_extractBlocks()` method — the raw XML block extraction

Both are kept temporarily for backwards compatibility but `_assembleConfigFile` becomes the default path in `init()`.

## Target file size
30-60 lines per config file. Down from 3,000-10,000.

## Files Changed
- Modify: `lib/project-initializer.js` — add `_assembleConfigFile()`, make `init()` use it by default
- Modify: `lib/project-initializer.js` — keep `_render()` behind a `legacy: true` flag

## Dependencies
- Spec: Instinct Block Generator (for `renderInstinctBlock`)
- Already done: Spec A (profiles), Spec H (skill table), Spec G (references)
