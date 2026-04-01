# BookLib — Target Architecture
*April 2, 2026 | Where we're heading*

---

## Core Principle

BookLib is a knowledge database the agent QUERIES — not a file it reads at startup. The agent's own intelligence decides when to query. BookLib returns clean, relevant, structured knowledge — or nothing.

---

## The Flow

```
User talks to their AI agent (Claude, Cursor, Copilot, etc.)
    ↓
Agent understands the user's intent
    ↓
Agent decides: "I should check BookLib for relevant knowledge"
    (triggered by MCP tool descriptions, not static rules)
    ↓
Agent calls BookLib MCP tool (search_skills, audit_content, etc.)
    ↓
BookLib search pipeline runs:
    Query → Expand → BM25 + Vector → RRF → Reranker
    ↓
Post-processing (configurable — user chose during init):
    ├── Fast mode: logit threshold filter + XML principle extraction
    ├── Local model: small model reasons about relevance
    └── API mode: external model synthesizes results
    ↓
Returns to agent:
    ├── Structured principles with source attribution
    └── OR "no relevant knowledge found" (if nothing passes threshold)
    ↓
Agent applies knowledge to the user's task — or ignores it
    (agent decides, not BookLib)
```

---

## What triggers the agent to query BookLib

NOT static rules in CLAUDE.md. NOT injected context at session start.

The MCP tool descriptions themselves are the trigger. When the agent sees:

> `search_skills`: "Use BEFORE reviewing code, answering best-practices questions, or suggesting patterns."

...it reaches for BookLib when those situations arise. The agent's own reasoning handles context — it knows when "reviewing auth code" should trigger a search and when "writing a commit message" shouldn't.

This is a single behavior: **"BookLib exists and knows things you don't. Check it when you're about to make a recommendation."**

Delivered via:
- MCP tool descriptions (works for all 10 MCP tools)
- One-line instinct block in config files (backup for tools that ignore MCP descriptions)
- SessionStart hook (Claude Code only — bonus, not dependency)

---

## What BookLib returns

### Current (raw chunks — bad)
```json
[
  {"score": 0.99, "text": "300 words of raw content...", "metadata": {...}},
  {"score": 0.98, "text": "250 words of irrelevant content...", "metadata": {...}}
]
```

Problem: junk pollutes agent context. Agent has to figure out what's relevant.

### Target (structured principles — good)
```json
{
  "query": "auth best practices for spring boot",
  "results": [
    {
      "principle": "Use stateless JWT with OncePerRequestFilter",
      "context": "Validate tokens per-request, don't store sessions server-side",
      "source": "springboot-security",
      "section": "core_principles"
    }
  ],
  "note": "1 relevant result found. Other candidates filtered as irrelevant."
}
```

Or when nothing is relevant:
```json
{
  "query": "best color palette for dashboard",
  "results": [],
  "note": "No relevant knowledge found."
}
```

### How the target format is produced (by processing mode)

**Fast mode (default, zero dependencies):**
1. Search returns chunks with reranker scores
2. Use raw logits (before sigmoid) to set a real relevance cutoff
3. Split matched chunks into individual principles using XML tag structure
4. Group by skill, deduplicate
5. Below threshold → "no relevant knowledge found"
6. Return structured JSON

**Local model mode:**
1. Search returns chunks (same as fast)
2. Small local model (Phi-3, Qwen2.5) reads query + chunks
3. Model selects relevant chunks, combines related ones, structures output
4. Returns synthesized principles

**API mode:**
1. Search returns chunks (same as fast)
2. External API call (Anthropic/OpenAI) with query + chunks
3. Model reasons, filters, synthesizes
4. Returns clean principles

---

## What goes where

| Component | Purpose | Owns what |
|-----------|---------|-----------|
| **MCP tool descriptions** | Tell agent WHEN to use BookLib | Trigger behavior |
| **Instinct block (config files)** | Backup trigger for agents that ignore MCP descriptions | 5-10 lines, behavioral only |
| **Search pipeline** | Find relevant chunks | BM25 + vector + SRAG + RRF + reranker |
| **Post-processor** | Filter junk, extract principles, structure output | Fast / local / API mode |
| **Knowledge graph** | Store and connect personal knowledge | Nodes, edges, traversal |
| **Config files (CLAUDE.md etc.)** | User's project documentation | User-owned, BookLib adds minimal section |
| **booklib.config.json** | BookLib settings | reasoning mode, tools, profile |

---

## What BookLib does NOT do

- **Does NOT dump knowledge into CLAUDE.md** — config files have a 5-10 line instinct block and a skill table, not content
- **Does NOT inject context at session start** — no SessionStart hooks loading hundreds of lines (except as optional Claude Code bonus)
- **Does NOT return irrelevant results** — if nothing passes the threshold, returns empty with a note
- **Does NOT require the user to remember commands** — the agent calls MCP tools automatically
- **Does NOT require an API key** — fast mode works with zero external dependencies

---

## Processing modes (user chooses during `booklib init`)

| Mode | Quality | Speed | Dependencies | Cost |
|------|---------|-------|-------------|------|
| **Fast** (default) | Good — threshold filtering + XML extraction | ~500ms | None | Free |
| **Local model** | Better — AI-powered relevance reasoning | ~3-8s | ~2GB RAM for model | Free |
| **API** | Best — full AI synthesis and reasoning | ~1-2s | API key (Anthropic/OpenAI) | ~$0.001/query |

Saved in `booklib.config.json` as `"reasoning": "fast"`.

---

## What needs to be built

### Already done
- Search pipeline (BM25 + vector + SRAG + RRF + reranker)
- MCP server with 8 tools
- MCP config writer for 10 tools
- Instinct block generator
- Config assembler (profile + instinct + skill table)
- Knowledge graph (capture, link, graph-augmented search)
- Wizard with clack UI
- Doctor diagnostics

### Needs building

**Priority 1 — makes the current system work properly:**
- [ ] Raw logit threshold filtering (use reranker logits, not sigmoid scores)
- [ ] XML principle extraction (split chunks into individual principles)
- [ ] Structured MCP response format (JSON with principle/source/section)
- [ ] "No relevant knowledge found" empty response
- [ ] Update MCP tool handlers to use new post-processing

**Priority 2 — enhancements:**
- [ ] Local model reasoning mode
- [ ] API reasoning mode
- [ ] Transformers.js v4 upgrade (4x faster indexing)
- [ ] Compact parser mode (ETH Zurich — less is better)

**Priority 3 — ecosystem:**
- [ ] MCP Server Cards
- [ ] Late chunking (+24% retrieval)
- [ ] Progressive disclosure

---

## Corrections (learned from this session)

- Never hardcode numbers (skill counts, tool counts) in user-facing docs
- Don't mention specific books in the pitch — BookLib is a platform, not a catalog
- Config files are for the USER's project docs, not for BookLib's knowledge dumps
- The agent decides when to query BookLib — not static rules
- Better to return nothing than return junk
