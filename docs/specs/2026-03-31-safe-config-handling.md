# Spec: Safe Handling of Existing Config Files
*Date: 2026-03-31 | Status: Draft*

## Problem

When a project already has a CLAUDE.md with user-written content (architecture decisions, team conventions, etc.), BookLib blindly appends its generated section. Edge cases:

1. **No markers** — file exists but was never BookLib-generated. BookLib appends 3000 lines to the user's carefully crafted file.
2. **Markers present** — BookLib replaces its section, preserving user content. This works but is never communicated to the user.
3. **User modified BookLib section** — user edited content between the markers. BookLib overwrites their edits without warning.

## Solution

Before modifying any existing config file, check and inform:

### Case 1: File exists, no BookLib markers
```
  CLAUDE.md already exists (142 lines, no BookLib section).
  [A] Append BookLib section at the end
  [S] Skip — don't modify this file
  >
```

### Case 2: File exists, BookLib markers present
```
  CLAUDE.md already exists (BookLib section found: lines 85-142).
  [U] Update BookLib section (preserves your content outside markers)
  [S] Skip
  >
```

### Case 3: File doesn't exist
Create it silently (current behavior, no change needed).

## Implementation

In `ProjectInitializer.init()`, before writing each file:

```js
if (fs.existsSync(absPath)) {
  const existing = fs.readFileSync(absPath, 'utf8');
  const hasMarkers = existing.includes(MARKER_START);
  const lineCount = existing.split('\n').length;
  
  // Inform user and get consent (via callback or quiet mode)
  if (!hasMarkers) {
    // Case 1: append with consent
  } else {
    // Case 2: update section
  }
}
```

Add an `onFileConflict` callback to `init()` options:
```js
await initializer.init({
  skills,
  target,
  onFileConflict: async ({ filePath, lineCount, hasMarkers }) => {
    // wizard prompts user, returns 'append' | 'update' | 'skip'
  }
});
```

For non-interactive mode (legacy `--tool=` path), default to the current behavior (append/update without asking).

## Files Changed

- Modify: `lib/project-initializer.js` — add `onFileConflict` callback to `init()`
- Modify: `lib/wizard/index.js` — pass conflict handler to `init()`

## No Dependencies

Can be implemented independently.
