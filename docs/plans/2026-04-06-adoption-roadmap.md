# BookLib Adoption Roadmap

> **For coding agents:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Make BookLib's value undeniable in the first 30 seconds of use.

**Core insight:** BookLib detects what AI models don't know about YOUR project and fixes it automatically. The wow moment is showing the user exactly which lines of their code the model would get wrong.

---

## Task 1: The Wow Moment — Cross-reference gaps with imports

Connect Spec 2.1 (gap detection) with Spec 2.2 (import detection) to show the user exactly which APIs in their code are affected by post-training knowledge gaps.

**Files:**
- Create: `lib/engine/project-analyzer.js`
- Modify: `lib/wizard/index.js` (add analysis step after gap resolution)

**What it does:**

```javascript
// ProjectAnalyzer combines gap detection + import detection
class ProjectAnalyzer {
  /**
   * Scan all source files in a project, cross-reference:
   * 1. Which deps are post-training (from GapDetector)
   * 2. Which imports in code use those deps (from ImportParser)
   * 3. Which specific files and APIs are affected
   * 
   * Returns: affected files with specific API names
   */
  async analyze(projectDir) {
    // Get post-training deps
    const gaps = await gapDetector.detect(projectDir);
    const postTrainingNames = new Set(gaps.postTraining.map(d => d.name));
    
    // Scan all source files for imports
    // Filter to only imports from post-training deps
    // Return: [{ file, dep, apis: ['cacheLife', 'after'] }]
  }
}
```

**Wizard output after init:**

```
◇ BookLib analyzed your project:

  next@16.2.0 (model trained on v15):
    src/app.ts         → cacheLife, after
    src/middleware.ts   → unstable_rethrow
    src/layout.tsx      → ViewTransition
    
  @stripe/stripe-js@5.0 (model trained on v4):
    src/payments.ts    → confirmSetup (signature changed)

  5 files affected, 6 post-training APIs in your code.
  ✓ Current docs indexed — your AI is now up to date.
  
  Try: ask your AI to refactor src/app.ts
```

**Tests:**
- Project with post-training deps + matching imports → lists affected files
- Project with post-training deps but no matching imports → "deps updated but your code uses stable APIs"
- Project with no post-training deps → skips analysis
- Empty project → graceful skip

---

## Task 2: Fix wizard bugs

Critical bugs blocking adoption. Must be bulletproof — one error = uninstall.

**Files:**
- Modify: `lib/wizard/index.js`
- Modify: `lib/engine/indexer.js`

**Bugs to fix:**

- [ ] "Unexpected end of JSON input" when indexing docs/specify — the indexer crashes on corrupt or empty BM25. Add validation before JSON.parse, rebuild if corrupt.
- [ ] "0 recommended skills" — search fails silently when BM25 is missing at project level. Ensure searcher falls back to package root's index.
- [ ] Wizard re-runs should be idempotent — `booklib init --reset` then `booklib init` should not duplicate sources or skills.
- [ ] Skills that are already installed from other sources (superpowers, speckit, etc.) should show as "installed (external)" not "not found in catalog".
- [ ] `stepConnectDocs` fails for directories with non-UTF8 files or binary files — add file type check before indexing.
- [ ] `--reset` should clear `.booklib/initialized` marker AND offer to clear sources/index, not just re-run.

**Tests:**
- Wizard with corrupt BM25 → recovers, doesn't crash
- Wizard run twice → idempotent (same result)
- Wizard with external skills installed → shows them correctly

---

## Task 3: End-to-end validation test

Prove the full flow works: init → detect → resolve → code generation improves.

**Files:**
- Create: `tests/e2e/full-flow.test.js`
- Create: `tests/e2e/test-project/` (minimal project with post-training deps)

**Test scenario:**

```
1. Create test project:
   - package.json with next@16, @tanstack/react-query@6
   - src/app.ts that imports cacheLife from 'next/cache'
   - docs/ with one team decision

2. Run: booklib init (non-interactive, with defaults)
   Assert: index created, gaps detected, docs connected

3. Run: booklib gaps
   Assert: next@16 and @tanstack/react-query@6 flagged as post-training

4. Run: booklib check-imports src/app.ts
   Assert: cacheLife flagged as unknown (not in index)

5. Run: booklib resolve-gaps
   Assert: Context7 (or mock) resolves next@16 docs

6. Run: booklib check-imports src/app.ts (again)
   Assert: cacheLife now covered (in index after resolution)

7. Run: booklib search "next.js caching"
   Assert: returns current v16 docs, not v15

8. Run: booklib check-decisions src/app.ts
   Assert: no contradictions (or expected contradiction if team decision exists)
```

**This is THE proof** that the product works. If this test passes, the product works.

---

## Task 4: Fix imports (Spec 2.2 bugs from testing)

Issues found during wizard testing.

**Files:**
- Modify: `lib/engine/import-parser.js`
- Modify: `lib/engine/import-checker.js`

**Fixes:**
- [ ] Multiline JS imports — the regex was fixed but needs validation on real-world codebases. Test with: destructured imports, re-exports, type-only imports.
- [ ] Python relative imports (`from . import foo`) — verify they're properly skipped.
- [ ] TypeScript `import type` — should be treated same as regular imports for gap detection purposes.
- [ ] Import checker with no searcher (hook context) → currently marks everything as unknown. Should mark as "unchecked" and not report.
- [ ] Performance: scanning 500+ files should take <5s. Currently sequential — batch the file reads.

---

## Task 5: README and landing page

The README should sell the product in 10 seconds.

**Files:**
- Modify: `README.md`

**Structure:**

```markdown
# BookLib

Your AI writes code using knowledge from 2025. Your project uses 
libraries from 2026. BookLib bridges the gap.

## What it does

BookLib detects what your AI model doesn't know about your project 
and fixes it automatically.

[GIF: booklib init → gaps detected → resolved → "your AI is now up to date"]

## 30-second setup

npm install @booklib/core
booklib init

## What happens

1. Scans your dependencies — finds post-training packages
2. Checks your code — finds APIs the model will hallucinate
3. Fetches current docs — from Context7, GitHub, or your team's Notion
4. Injects knowledge — via MCP, works with Claude/Cursor/Copilot/Gemini

## Your AI without BookLib
> Uses deprecated `cacheTag()` API from Next.js 15

## Your AI with BookLib  
> Uses current `cacheLife()` API from Next.js 16

## Works alongside
Context7 (library docs) · lsp-mcp (code structure) · any MCP tool
```

---

## Task 6: Record the viral demo

Screen recording showing BookLib's value on a real project.

**Script:**

```
1. Show: fresh project with Next.js 16
2. Ask AI: "add caching to this page" (WITHOUT BookLib)
   → AI uses deprecated v15 API (cacheTag, unstable_cache)
   
3. Run: booklib init (30 seconds)
   → Shows gaps detected, resolved via Context7
   → "5 post-training APIs in your code"

4. Ask AI: same question (WITH BookLib)
   → AI uses correct v16 API (cacheLife, use cache)
   → Cites BookLib knowledge in its response

5. Side-by-side comparison
```

**Where to post:** Twitter/X, Reddit r/programming, Hacker News, Dev.to

---

## Execution Order

```
Task 1 (Wow Moment)     ← highest impact, blocks Task 6
Task 2 (Fix Bugs)       ← blocks real-world testing  
Task 3 (E2E Test)       ← proves it works
Task 4 (Fix Imports)    ← polish
Task 5 (README)         ← needed for launch
Task 6 (Viral Demo)     ← launch asset
```

Tasks 1+2 can run in parallel. Task 3 validates 1+2. Tasks 5+6 are the launch.

---

## Success Metrics

- `booklib init` completes without errors on 10 different projects
- E2E test passes: gap → resolve → improved codegen
- README explains value in <10 seconds of reading
- Demo video is <2 minutes, shows clear before/after
- First 100 GitHub stars within 1 week of launch
