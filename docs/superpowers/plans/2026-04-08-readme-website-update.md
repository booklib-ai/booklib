# README & Website Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the website (docs/index.html) with the 2.1.0 release and new README — fix broken install commands, update stats, add 2.1.0 features, regenerate OG image.

**Architecture:** The website is a single static HTML file (`docs/index.html`) with inline JS data arrays (SKILLS, AGENTS, RULES, PROFILES). All changes are in this one file plus the OG image. The README was already rewritten — this plan covers only remaining fixes and the website.

**Tech Stack:** HTML/CSS/JS (static), Node.js scripts for OG image generation, vhs for terminal recording.

---

### Task 1: Fix broken install command and badges on website

**Files:**
- Modify: `docs/index.html:425` (install command)
- Modify: `docs/index.html:430-431` (badge URLs)
- Modify: `docs/index.html:547` (footer NPM link)

- [ ] **Step 1: Fix install command**

Change line 425 from:
```html
<div class="install-code" id="main-cmd">npm install -g booklib</div>
```
to:
```html
<div class="install-code" id="main-cmd">npm install -g @booklib/core</div>
```

- [ ] **Step 2: Fix badge URLs**

Change lines 430-431 from:
```html
<img src="https://img.shields.io/npm/v/booklib.svg" alt="v"/>
<img src="https://img.shields.io/npm/dw/booklib.svg" alt="dw"/>
```
to:
```html
<img src="https://img.shields.io/npm/v/%40booklib%2Fcore.svg" alt="v"/>
<img src="https://img.shields.io/npm/dw/%40booklib%2Fcore.svg" alt="dw"/>
```

- [ ] **Step 3: Fix footer NPM link**

Change line 547 from:
```html
<a href="https://www.npmjs.com/package/booklib">NPM</a>
```
to:
```html
<a href="https://www.npmjs.com/package/@booklib/core">NPM</a>
```

- [ ] **Step 4: Verify in browser**

Run: `open docs/index.html`
Expected: Install shows `@booklib/core`, badges load correctly, footer link works.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html
git commit -m "fix(website): update install command and badges to @booklib/core"
```

---

### Task 2: Update hero section and meta tags

**Files:**
- Modify: `docs/index.html:7-9` (meta tags)
- Modify: `docs/index.html:421-422` (hero title and paragraph)

- [ ] **Step 1: Update meta description**

Change line 7 from:
```html
<meta name="description" content="22 curated book skills + 258 community skills for AI agents. Works for code, product, writing, strategy, and design. Automatic context injection, semantic search, and compatibility with obra/superpowers and ruflo."/>
```
to:
```html
<meta name="description" content="Detects AI knowledge gaps in your codebase and fixes them. Post-training API detection across 10 ecosystems, runtime context injection via MCP, team knowledge capture. Works with Claude, Cursor, Copilot, and 14 AI tools."/>
```

- [ ] **Step 2: Update OG description**

Change line 9 from:
```html
<meta property="og:description" content="An open knowledge ecosystem for AI agents. Book-grounded skills for code, product, writing, strategy, and design — with discovery, semantic search, and orchestrator compatibility."/>
```
to:
```html
<meta property="og:description" content="Detects what your AI doesn't know about your project and fixes it. Runtime context injection, post-training gap detection, team knowledge — delivered via MCP to 14 AI coding tools."/>
```

- [ ] **Step 3: Update hero title and paragraph**

Change line 421 from:
```html
<h1>Skills</h1>
```
to:
```html
<h1>BookLib</h1>
```

Change line 422 from:
```html
<p>An open knowledge ecosystem for AI agents — code and beyond. 22 book-grounded skills + 258 community skills covering programming, product, writing, strategy, and design. Automatic context injection and obra/superpowers &amp; ruflo compatibility.</p>
```
to:
```html
<p>A context engineering tool for AI coding assistants. Detects post-training knowledge gaps, resolves them automatically, and delivers your team's decisions via MCP to Claude, Cursor, Copilot, and 10+ tools. 24 expert skills, 760 tests, 10 ecosystems.</p>
```

- [ ] **Step 4: Commit**

```bash
git add docs/index.html
git commit -m "docs(website): update hero and meta tags for 2.1.0"
```

---

### Task 3: Replace bento grid with 2.1.0 features

**Files:**
- Modify: `docs/index.html:436-474` (bento grid section)

- [ ] **Step 1: Replace the entire bento grid**

Replace lines 436-474 (from `<h2 class="section-title">Two Layers` through the closing `</div>` of `.bento-grid`) with:

```html
  <h2 class="section-title">What It Does</h2>
  <div class="bento-grid">
    <div class="bento-item">
      <div>
        <h3>Gap Detection</h3>
        <div class="value">10</div>
        <div class="sub-value">Package ecosystems</div>
        <div class="desc">Scans npm, PyPI, Maven, Cargo, and 6 more — finds every post-training dependency in your code</div>
      </div>
      <div class="meta">booklib analyze</div>
    </div>
    <div class="bento-item">
      <div>
        <h3>Runtime Injection</h3>
        <div class="value">MCP</div>
        <div class="sub-value">Pre/PostToolUse hooks</div>
        <div class="desc">3-10 lines of context injected before each AI edit via a pre-computed context map</div>
      </div>
      <div class="meta">hooks/pretooluse-inject.mjs</div>
    </div>
    <div class="bento-item">
      <div>
        <h3>AI Tools</h3>
        <div class="value">14</div>
        <div class="sub-value">Auto-configured</div>
        <div class="desc">Claude, Cursor, Copilot, Gemini, Codex, Windsurf, Roo Code, Goose, Zed, Continue, and more</div>
      </div>
      <div class="meta">booklib init</div>
    </div>
    <div class="bento-item">
      <div>
        <h3>Expert Skills</h3>
        <div class="value">24</div>
        <div class="sub-value">From canonical books</div>
        <div class="desc">Effective Java, Clean Code, DDD, and 21 more — distilled into actionable principles</div>
      </div>
      <div class="meta">booklib install &lt;skill&gt;</div>
    </div>
  </div>
```

- [ ] **Step 2: Verify in browser**

Run: `open docs/index.html`
Expected: Four cards — Gap Detection (10), Runtime Injection (MCP), AI Tools (14), Expert Skills (24).

- [ ] **Step 3: Commit**

```bash
git add docs/index.html
git commit -m "docs(website): replace bento grid with 2.1.0 features"
```

---

### Task 4: Update "How it works" feature checklist

**Files:**
- Modify: `docs/index.html:482` (description paragraph)
- Modify: `docs/index.html:489-495` (feature checklist)

- [ ] **Step 1: Update the description paragraph**

Change line 482 from:
```html
<p ...>BookLib integrates with your AI agent via <strong>MCP</strong> — the agent calls BookLib tools directly when it needs knowledge. No commands to remember, no context dumps. The agent asks, BookLib answers with structured, relevant principles.</p>
```
to:
```html
<p style="color: var(--text-dim); font-size: var(--text-lg); margin-bottom: var(--space-6);">BookLib detects what your AI doesn't know, fixes it automatically, and delivers context via <strong>MCP</strong> and runtime hooks. No commands to remember — knowledge flows to your AI as it writes code.</p>
```

- [ ] **Step 2: Replace the feature checklist**

Replace lines 489-495 with:
```html
          <li style="display: flex; gap: var(--space-3);"><span style="color: var(--primary); font-weight: 800;">✔</span> Post-training gap detection — 10 ecosystems, cross-referenced with source code</li>
          <li style="display: flex; gap: var(--space-3);"><span style="color: var(--primary); font-weight: 800;">✔</span> Runtime injection — PreToolUse/PostToolUse hooks powered by context maps</li>
          <li style="display: flex; gap: var(--space-3);"><span style="color: var(--primary); font-weight: 800;">✔</span> Auto-resolution — Context7, GitHub releases, web docs fetched automatically</li>
          <li style="display: flex; gap: var(--space-3);"><span style="color: var(--primary); font-weight: 800;">✔</span> Hybrid search — BM25 + vector + cross-encoder reranking</li>
          <li style="display: flex; gap: var(--space-3);"><span style="color: var(--primary); font-weight: 800;">✔</span> Processing modes — fast (BM25), local (Ollama), or cloud AI</li>
          <li style="display: flex; gap: var(--space-3);"><span style="color: var(--primary); font-weight: 800;">✔</span> 14 AI tools — Claude, Cursor, Copilot, Gemini, Codex, Windsurf, and more</li>
```

- [ ] **Step 3: Commit**

```bash
git add docs/index.html
git commit -m "docs(website): update feature checklist for 2.1.0"
```

---

### Task 5: Update SKILLS array and deprecated commands

**Files:**
- Modify: `docs/index.html:554-577` (SKILLS array — add 2 missing skills)
- Modify: `docs/index.html:454` (fetch → install in bento, already handled in Task 3)
- Modify: `docs/index.html:677` (fetch → install in card click handler)

- [ ] **Step 1: Find the 2 missing skills**

Run: `ls skills/*/SKILL.md | wc -l` to count actual skills.
Cross-reference against the 22-entry SKILLS array to find which 2 are missing.

Run:
```bash
ls -d skills/*/ | sed 's|skills/||;s|/||' | sort > /tmp/disk-skills.txt
node -e "const s=$(cat docs/index.html | grep -oP 'name: \"\K[^\"]+'); s.forEach(n=>console.log(n))" | sort > /tmp/html-skills.txt
diff /tmp/disk-skills.txt /tmp/html-skills.txt
```

- [ ] **Step 2: Add the 2 missing skills to the SKILLS array**

Add entries after line 577 (before the `];`), following the existing format:
```javascript
    { name: "<skill-1>", book: "<Book Title>", author: "<Author>", isbn: "<ISBN>", desc: "<description>", profiles: ["<profile>"] },
    { name: "<skill-2>", book: "<Book Title>", author: "<Author>", isbn: "<ISBN>", desc: "<description>", profiles: ["<profile>"] },
```

- [ ] **Step 3: Fix deprecated `booklib fetch` in card click handler**

Find the line containing `booklib fetch ${skill.name}` (around line 677) and change to:
```javascript
`booklib install ${skill.name}`
```

- [ ] **Step 4: Add missing profiles**

Add 5 profiles to the PROFILES array (line 599-609):
```javascript
    { id: "product", name: "Product" },
    { id: "writer", name: "Writing" },
    { id: "strategist", name: "Strategy" },
    { id: "designer", name: "Design" },
    { id: "legal", name: "Legal" },
```

- [ ] **Step 5: Commit**

```bash
git add docs/index.html
git commit -m "docs(website): add missing skills, fix deprecated fetch command, add profiles"
```

---

### Task 6: Update terminal demo animation

**Files:**
- Modify: `docs/index.html:765-777` (terminal demo script data)

- [ ] **Step 1: Find the terminal animation data**

Search for the demo lines array (around line 765). It currently shows `booklib search` and `booklib scan --docs`.

- [ ] **Step 2: Replace with gap detection demo**

Replace the demo lines with output from `booklib analyze` — showing post-training API detection on a real project. Use the output we captured from vercel/ai-chatbot:

```javascript
{ text: '$ booklib analyze', class: 'cmd' },
{ text: 'Analyzing project...', class: 'dim' },
{ text: '', class: '' },
{ text: 'ai@6.0.116 (post-training):', class: 'warn' },
{ text: '  app/api/chat/route.ts → streamText, createUIMessageStreamResponse', class: '' },
{ text: '  lib/ai/providers.ts → customProvider, gateway', class: '' },
{ text: '', class: '' },
{ text: 'react@19.0.1 (post-training):', class: 'warn' },
{ text: '  app/login/page.tsx → useActionState', class: '' },
{ text: '  components/chat/artifact.tsx → memo, useCallback', class: '' },
{ text: '', class: '' },
{ text: '158 file(s), 274 post-training API(s).', class: 'success' },
```

- [ ] **Step 3: Update the "Searching X bundled" line if present**

Change any reference to "22 bundled" to "24 bundled".

- [ ] **Step 4: Commit**

```bash
git add docs/index.html
git commit -m "docs(website): replace terminal demo with gap detection output"
```

---

### Task 7: Update package.json SEO fields

**Files:**
- Modify: `package.json` (description and keywords)

- [ ] **Step 1: Update description**

Change:
```json
"description": "Knowledge bookkeeping for AI agents — expert skills, hybrid search, knowledge graph, MCP tools",
```
to:
```json
"description": "Detects AI knowledge gaps in your codebase and fixes them — post-training API detection, team knowledge, and runtime context injection via MCP for Claude, Cursor, Copilot, and 10+ AI coding tools",
```

- [ ] **Step 2: Update keywords**

Replace the keywords array with:
```json
"keywords": [
  "mcp",
  "model-context-protocol",
  "ai-coding",
  "ai-agent",
  "context-engineering",
  "claude",
  "claude-code",
  "cursor",
  "copilot",
  "codex",
  "knowledge-graph",
  "rag",
  "code-review",
  "ai-context"
],
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: update package description and keywords for discoverability"
```

---

### Task 8: Regenerate OG image

**Files:**
- Modify: `docs/og.png` (regenerate)
- Check: `scripts/gen-og.mjs` (if it exists)

- [ ] **Step 1: Check if OG generation script exists**

Run: `ls scripts/gen-og.mjs`

If it exists, update the stats in the script:
- "24 expert skills" (was 22)
- "760 tests" (new)
- "10 ecosystems" (new)
- "14 AI tools" (new)
- Version "2.1.0"

- [ ] **Step 2: Regenerate**

Run: `node scripts/gen-og.mjs`
Expected: New `docs/og.png` with updated stats.

If the script doesn't exist or fails, this step can be deferred — the current OG image still works, it just shows old numbers.

- [ ] **Step 3: Commit**

```bash
git add docs/og.png scripts/gen-og.mjs
git commit -m "docs: regenerate OG image with 2.1.0 stats"
```

---

### Task 9: Final verification

**Files:** None (read-only verification)

- [ ] **Step 1: Verify website renders correctly**

Run: `open docs/index.html`

Check:
- Install command shows `@booklib/core`
- Badges load (may need network)
- Bento grid shows 4 new cards (Gap Detection, Runtime Injection, AI Tools, Expert Skills)
- Feature checklist shows 6 items including gap detection and runtime injection
- Terminal demo shows `booklib analyze` output
- Footer NPM link goes to `@booklib/core`
- Skill cards show `booklib install` not `booklib fetch`
- Skill count is 24

- [ ] **Step 2: Verify README renders correctly**

Run: `open README.md` (or view on GitHub)

Check:
- Demo GIF animates
- Code blocks render correctly
- All links work
- Stats line matches: 760 tests, 22 skills, 10 ecosystems, 14 tools

- [ ] **Step 3: Run tests to make sure nothing broke**

Run: `npm test`
Expected: 760 pass, 0 fail.
