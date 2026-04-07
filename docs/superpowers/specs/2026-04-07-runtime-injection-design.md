# Runtime Micro-Injection System — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Inject precisely what the AI model doesn't know — and only that — at the moment it's writing code. No document dumps, no generic knowledge. 3-10 lines of targeted context, pre-computed for <10ms runtime.

**Research basis:**
- ETH Zurich (arxiv:2602.11988): structured context +4%, unstructured hurts -0.5% to -2%
- BookLib A/B tests: 4:1 expansion +5, examples mandatory (+5 → 0 without), 500-800 words optimal
- Generic skill knowledge: +0 improvement (model already knows)
- Post-training + team knowledge: the validated differentiator

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  KNOWLEDGE STORE                     │
│                                                      │
│  Connected Sources:    Gap Index:     Context Map:   │
│  Notion, GitHub,       dep→version    knowledge →    │
│  .specify, ADRs,       (existing)     scoped         │
│  user notes                           injections     │
│  (existing)                           (NEW)          │
└────────┬────────────────┬──────────────┬─────────────┘
         │                │              │
   ┌─────▼──────┐  ┌─────▼──────┐  ┌───▼────────────┐
   │  LAYER 1   │  │ LAYER 2a   │  │  LAYER 2b      │
   │  MCP Tools │  │ PreToolUse │  │  PostToolUse   │
   │            │  │ Hook       │  │  Hook          │
   │ Universal  │  │ Enhanced   │  │  Enhanced      │
   │ (all tools)│  │ (Claude    │  │  (Claude Code, │
   │            │  │  Code,     │  │   Cursor)      │
   │ AI calls   │  │  Cursor)   │  │                │
   │ lookup/    │  │            │  │  Catches       │
   │ brief      │  │ Injects    │  │  contradictions│
   │            │  │ before     │  │  after writing  │
   │ Full       │  │ Edit/Write │  │                │
   │ synthesis  │  │            │  │  Warns only    │
   │ 500-800w   │  │ 3-10 lines │  │                │
   └────────────┘  └────────────┘  └────────────────┘
```

### Layer 1: MCP Tools (Universal)

Works with all 12+ tools via MCP. The AI explicitly calls `lookup` or `brief`.

**When it triggers:** Tool description prompts the AI to call when encountering unfamiliar APIs, needing project-specific context, or verifying team conventions. NOT for generic programming questions.

**Tool description:**
```
"Check BookLib when working with project-specific APIs, team decisions, 
or dependencies that may have changed since your training. BookLib 
knows what you don't. Skip for standard patterns you already know."
```

**Response priority (three stages):**

1. **Post-training corrections** — if the query touches post-training deps, fetch current API docs (from Context7 cache or gap resolutions). Include code example.
2. **Team knowledge** — search knowledge index (decisions, notes, specs, Notion, GitHub) for items matching the query. 4:1 synthesis with example. Resolve contradictions (latest wins).
3. **Niche domain skills** — only skills covering knowledge the model genuinely lacks. Not generic programming (effective-java, clean-code = +0). Only specialized domain knowledge the model wasn't trained on.

**Response format:** 500-800 words, structured: Corrections / Constraints / Context / Example. Proven format from A/B testing (+5 with examples, +0 without).

---

### Layer 2a: PreToolUse Hook (Enhanced)

Fires automatically before every Edit/Write in tools that support hooks. The AI doesn't call anything — BookLib injects proactively.

**Input from tool:**
```
Edit: { file_path, old_string, new_string }
Write: { file_path, content }
```

**Runtime flow (<10ms total):**

```
Step 1: Load context map (.booklib/context-map.json)
  → Cached in memory after first read (~1ms for 50KB)

Step 2: Match file path against item filePatterns
  → Glob match, typically 5-20 broad matches
  → <1ms

Step 3: Narrow by code context (old_string)
  → Check codeTerms: string.includes() on code block
  → Check functionPatterns: regex on function names
  → Check importTriggers: match file's imports
  → Narrows to 1-5 relevant items
  → <5ms

Step 4: Assemble injection
  → Collect pre-computed injection text from matched items
  → Cap at 5 items, sorted by match strength:
    1. importTriggers match (strongest)
    2. functionPatterns match
    3. codeTerms match
    4. filePatterns only (weakest)
  → <1ms

Step 5: Return or stay silent
  → 0 matches: empty response, hook invisible
  → 1-5 matches: formatted hint
```

**Example injection — editing `src/api/admin/users/route.ts`:**
```
[BookLib] Context for this file:

next@14.2.35: published 2025-12-11, model may have outdated knowledge.
  Middleware behavior changed in 14.2.30+.

@supabase/supabase-js@2.95.3: published 2026-02-06, post-training.
  createClient() now requires explicit auth config in v2.90+.
  const supabase = createClient(url, key, { auth: { persistSession: false } })

Team: all API responses use { data, error, meta } envelope (.specify/constitution)
Team: admin endpoints require role check via middleware (ADR-005)
```

**Example — editing `src/components/Header.tsx`:**
```
(nothing — no matches, hook stays completely silent)
```

---

### Layer 2b: PostToolUse Hook (Enhanced)

Fires after Edit/Write completes. Checks the written code against team constraints.

**Runtime flow (<10ms):**

```
Step 1: Read new_string (what the model just wrote)

Step 2: Match against context map (same as PreToolUse)

Step 3: Contradiction check
  → For each matched knowledge item with a constraint:
    • Extract prohibited terms (reuse PROHIBITION_PATTERNS)
    • Check if new code contains prohibited patterns
  → ONLY fires on actual contradictions

Step 4: Return warning or stay silent
  → 0 contradictions: silent
  → 1+ contradictions: specific warning
```

**Example warning:**
```
[BookLib] Contradiction detected:

Code uses stripe.charges.create() — team decision ADR-001 
requires PaymentIntents API instead.
  → stripe.paymentIntents.create({ amount, currency })
```

**What PostToolUse does NOT do:**
- No post-training corrections (that's PreToolUse)
- No full search or synthesis
- No generic advice
- Only: "you violated a specific team constraint"

---

## Context Map

The core new component. Pre-computed at index time, used at runtime.

### Structure: `.booklib/context-map.json`

```json
{
  "version": 1,
  "builtAt": "2026-04-07T12:00:00Z",
  "items": [
    {
      "id": "adr-001",
      "text": "Use PaymentIntents not Charges API",
      "source": "docs/decisions.md",
      "type": "team-decision",
      "match": {
        "filePatterns": ["**/payment**", "**/billing**", "**/checkout**"],
        "codeTerms": ["charges", "charge", "stripe"],
        "functionPatterns": ["create*Payment", "process*Charge"],
        "importTriggers": ["stripe", "@stripe/stripe-js"]
      },
      "injection": {
        "correction": null,
        "constraint": "Use PaymentIntents API, not Charges (ADR-001).",
        "example": "const intent = await stripe.paymentIntents.create({ amount, currency });"
      }
    },
    {
      "id": "gap-next-14.2.35",
      "text": "next@14.2.35 is post-training",
      "source": "gap-detection",
      "type": "post-training",
      "match": {
        "filePatterns": ["**"],
        "codeTerms": [],
        "functionPatterns": [],
        "importTriggers": ["next", "next/cache", "next/image", "next/navigation"]
      },
      "injection": {
        "correction": "next@14.2.35 (published 2025-12-11). Model trained on earlier v14.2.x.",
        "constraint": null,
        "example": null
      }
    }
  ]
}
```

### Build Process

**When it runs:**
- During `booklib init` (after knowledge indexing)
- Incrementally on `booklib remember` / `booklib connect`
- Rebuilds only new/changed items

**Two-step build per knowledge item:**

**Step 1: Keyword extraction (instant, every item):**
```
Input: "All API responses must use {data, error, meta} envelope"
Output: {
  codeTerms: ["api", "response", "data", "error", "meta", "envelope"],
  filePatterns: ["**/api/**", "**/route**"],
  importTriggers: []
}
```
Pure regex/NLP extraction. No LLM call.

**Step 2: LLM scope inference (one-time, batched):**
```
Prompt: "Given this team decision, what code patterns would it apply to?
  Decision: 'All API responses must use {data, error, meta} envelope'
  Return: function patterns, import triggers, specific scenarios"

Output: {
  functionPatterns: ["*handler*", "*route*", "*controller*"],
  importTriggers: ["express", "fastify", "hono", "next/server"],
  scenarios: ["creating REST endpoints", "returning JSON"]
}
```
Uses the user's chosen processing model (Cloud AI / Local Ollama / Fast mode skips this step and uses keyword extraction only).

Batched: 20 items per LLM call. Run once per knowledge item, cached.

**Step 3: Pre-compute injection text:**
```
For each item, generate the 1-3 line injection:
  correction: "API X changed in version Y" (for post-training items)
  constraint: "Team requires Z" (for team decisions)
  example: one code snippet (for items where an example exists)
```
Also uses the user's chosen model, or templated for Fast mode.

### Post-training items

Gap detection results are automatically added to the context map:
```
For each post-training dep:
  → match.importTriggers = all known import paths for that package
  → injection.correction = "{pkg}@{version} published {date}, post-training"
  → injection.example = from Context7 cache if available, null otherwise
```

---

## Modified Components

### MCP Tool Descriptions (bin/booklib-mcp.js)

**lookup tool — new description:**
```
"Check BookLib when working with project-specific APIs, team decisions, 
or dependencies that may have changed since your training. BookLib 
knows what you don't. Skip for standard patterns you already know."
```

**lookup handler — new priority logic:**
```javascript
case "lookup": {
  // Stage 1: Post-training corrections
  const gapResults = checkGapsForQuery(args.query, args.file);
  
  // Stage 2: Team knowledge
  const teamResults = searchTeamKnowledge(args.query, args.file);
  
  // Stage 3: Niche domain skills (only if 1+2 insufficient)
  const nicheResults = (gapResults.length + teamResults.length < 2)
    ? searchNicheSkills(args.query) : [];
  
  // Synthesize with priority ordering
  return synthesize([...gapResults, ...teamResults, ...nicheResults]);
}
```

### CLAUDE.md Template

Updated agent behavior section:
```markdown
## BookLib
BookLib knows what your AI doesn't — post-training API changes, 
team decisions, project-specific conventions.

- When working with unfamiliar APIs or post-training deps → lookup
- When starting a new task in an unfamiliar area → brief  
- When user says "remember/capture this" → remember
- Don't call lookup for standard programming patterns you already know
```

### Wizard Step

After knowledge indexing, before skill recommendation:
```
Step N: Build context map
  → Extract keywords from all indexed knowledge items
  → Batch LLM scope inference (if Cloud/Local mode)
  → Generate injection text
  → Save .booklib/context-map.json
  → "Context map built: X items scoped for runtime injection"
```

### Hooks Configuration (hooks/hooks.json)

```json
{
  "PreToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "node \"${BOOKLIB_ROOT}/hooks/pretooluse-inject.mjs\""
      }]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "Edit|Write", 
      "hooks": [{
        "type": "command",
        "command": "node \"${BOOKLIB_ROOT}/hooks/posttooluse-contradict.mjs\""
      }]
    }
  ]
}
```

---

## New Components

### lib/engine/context-map.js

Core module. Exports:

```javascript
export class ContextMapBuilder {
  constructor(opts) // { processingMode, model, apiKey }
  
  async buildFromKnowledge(knowledgeItems)  // team decisions, notes, specs
  async buildFromGaps(gapResults)           // post-training deps
  async addItem(knowledgeItem)              // incremental add
  
  save(filePath)    // write .booklib/context-map.json
  static load(filePath)  // read and return items array
}

export class ContextMapMatcher {
  constructor(items)  // loaded context map items
  
  match(filePath, codeBlock, imports)  // returns matched items sorted by strength
  checkContradictions(codeBlock, matchedItems)  // returns violations
}

// Internal helpers
export function extractKeywords(text)       // → codeTerms, filePatterns
export function buildInjectionText(item)    // → { correction, constraint, example }
```

### hooks/pretooluse-inject.mjs

```javascript
// Reads tool input from stdin (JSON: { tool_name, tool_input })
// Loads context map from .booklib/context-map.json
// Matches file path + code block
// Returns formatted injection or empty (silent)
// Must complete in <100ms
```

### hooks/posttooluse-contradict.mjs

```javascript
// Reads tool input from stdin (JSON: { tool_name, tool_input })
// Loads context map
// Checks new code against matched constraints
// Returns warning or empty (silent)
// Must complete in <100ms
```

---

## Deferred

### Phase 2: Starter Packs
- Curate and aggregate domain-specific skills from community GitHub repos
- Not generic programming knowledge (model knows that)
- Domain knowledge: healthcare, fintech, e-commerce, etc.
- Wizard offers packs during init when no team knowledge connected yet
- Packs are just pre-built context map items from community sources

### v2 Enhancements
- AST parsing (tree-sitter) for more precise code scoping at init time
- Hook support for Cursor, Windsurf, and other tools beyond Claude Code
- User-provided scopes UI (`--scope=api` on `booklib remember`)
- Visual UI for reviewing/editing the context map
- PostToolUse with fix suggestions (not just warnings)
- Confidence scoring on matches (v1 uses simple match-strength sorting)

### Decision Log
- Context map JSON parse at 500KB+: acceptable (<5ms). Revisit at 1MB+.
- PreToolUse injection cap: 5 items max. Revisit based on user feedback.
- Scope inference model: respects user's wizard choice (Cloud/Local/Fast-keyword-only).
- Hook support beyond Claude Code: deferred. MCP Layer 1 covers all tools.
- Skills at runtime: only niche domain knowledge, never generic programming.

---

## Success Criteria

1. PreToolUse hook completes in <100ms (target <10ms)
2. Injection fires only when relevant — silent >80% of edits
3. Post-training corrections prevent wrong API usage
4. Team decisions are surfaced before code is written
5. PostToolUse catches contradictions in written code
6. MCP lookup returns prioritized, relevant results (not junk from bloated index)
7. Context map builds in <30 seconds for a project with 100 knowledge items
8. Zero crashes, graceful degradation (missing map = hooks stay silent)
