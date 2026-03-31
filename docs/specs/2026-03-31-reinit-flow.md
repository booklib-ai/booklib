# Spec: Re-init Flow
*Date: 2026-03-31 | Status: Draft*

## Problem

Running `booklib init` on an already-initialized project silently runs `runRelevanceAudit` instead of the setup wizard. No way to re-run full setup without manually deleting `.booklib/initialized`.

## Solution

When the `.booklib/initialized` marker exists, prompt the user:

```
BookLib is already initialized in this project (since 2026-03-31).

  [R] Re-run full setup
  [A] Run relevance audit
  [Q] Quit

  >
```

Also support `booklib init --reset` to skip the prompt and go straight to full setup (deletes the marker and runs `runSetup`).

## Implementation

In `runWizard()`:
```js
if (fs.existsSync(markerPath)) {
  if (args.includes('--reset')) {
    fs.rmSync(markerPath);
    return runSetup(cwd);
  }
  // prompt user with R/A/Q options
}
```

## Files Changed

- Modify: `lib/wizard/index.js` — add re-init prompt to `runWizard()`
- Modify: `bin/booklib.js` — pass `--reset` flag to `runWizard()`

## No Dependencies

Can be implemented independently.
