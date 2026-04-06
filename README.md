<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.uk.md">Українська</a>
</p>

<p align="center">
  <img src="assets/logo.svg" width="100" alt="booklib"/>
</p>

<h1 align="center">booklib</h1>

<p align="center">
  A knowledge platform for AI agents.<br/>
  Expert knowledge, personal insights, and project context —<br/>
  searchable, structured, and delivered via MCP to any AI tool.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/core"><img src="https://img.shields.io/npm/v/@booklib/core.svg" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@booklib/core"><img src="https://img.shields.io/npm/dw/@booklib/core.svg" alt="downloads"/></a>
  <a href="https://github.com/booklib-ai/booklib/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/booklib?style=flat" alt="stars"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="license"/></a>
  <a href="https://github.com/booklib-ai/booklib/blob/main/CHANGELOG.md"><img src="https://img.shields.io/badge/Actively%20Maintained-✓-brightgreen" alt="actively maintained"/></a>
  <a href="https://github.com/booklib-ai/booklib/actions"><img src="https://img.shields.io/github/actions/workflow/status/booklib-ai/booklib/check.yml?branch=main" alt="CI/CD status"/></a>
</p>

<p align="center">
  <b>Multi-tool support</b> &nbsp;·&nbsp; <b>MCP-compatible</b> &nbsp;·&nbsp; <b>Hybrid search engine</b> &nbsp;·&nbsp; <b>Knowledge graph</b> &nbsp;·&nbsp; <b>Zero cloud dependencies</b>
</p>

---

## The Problem

Your AI writes code using knowledge from its training data. Your project uses libraries released **after** that training cutoff. The result: hallucinated APIs, deprecated patterns, and code that doesn't work.

## What BookLib Does

BookLib detects what your AI model doesn't know about your project and fixes it automatically.

```bash
npm install -g @booklib/core
booklib init
```

```
Analyzing your project...

  next@16.2.0 (model trained on v15):
    src/app.ts         → cacheLife, after
    src/middleware.ts   → unstable_rethrow

  @stripe/stripe-js@5.0 (model trained on v4):
    src/payments.ts    → confirmSetup (signature changed)

  5 files affected, 6 post-training APIs in your code.
  ✓ Current docs indexed — your AI is now up to date.
```

**Without BookLib:** AI uses deprecated `cacheTag()` from Next.js 15.
**With BookLib:** AI uses current `cacheLife()` from Next.js 16.

---

## How It Works

### 1. Detect Knowledge Gaps

Scans your dependencies across 8 package registries, checks publish dates against the model's training cutoff, then cross-references with your source code — not just "next@16 is new" but "your `src/app.ts` uses `cacheLife` which is a post-training API."

### 2. Resolve Automatically

For each gap, BookLib fetches current documentation:

1. **Context7** — instant, version-specific library docs
2. **GitHub releases** — changelogs and migration guides
3. **Manual** — suggests the right `booklib connect` command

### 3. Protect Your Code

Watches for problems as your AI writes code:

- **Import checking** — flags unknown APIs not in the index (11 languages)
- **Decision contradictions** — warns when code violates team decisions

### 4. Capture Team Knowledge

Your team's decisions live nowhere in public docs:

```
booklib remember --title "use PaymentIntents not Charges" --type decision
booklib connect notion database <db-id>
booklib connect github discussions org/repo
```

---

## What Makes BookLib Different

Every AI coding tool uses the same models. Context7 gives them current docs. Code graph tools give them codebase structure. **BookLib is the only tool that detects knowledge gaps, resolves them automatically, and layers your team's engineering culture on top.**

| Layer | Tool | What it knows |
|-------|------|--------------|
| Documentation | Context7 | Current library APIs |
| Code structure | lsp-mcp, CodeGraphContext | Functions, types, dependencies |
| **Knowledge** | **BookLib** | Post-training gaps, team decisions, expert principles |

---

## Features

| Feature | What it does |
|---------|-------------|
| **Gap Detection** | Scans deps across 8 registries, finds post-training packages |
| **Project Analysis** | Cross-references gaps with source code — shows affected files and APIs |
| **Auto-Resolution** | Fetches current docs via Context7, GitHub, or web connectors |
| **Import Checking** | Flags unknown APIs in 11 languages |
| **Decision Checking** | Detects when code contradicts captured team decisions |
| **Knowledge Graph** | Stores insights, decisions, patterns with auto-linking |
| **Source Connectors** | GitHub, Notion, local files, web docs, Obsidian vaults |
| **Source Detection** | Recognizes 12 content types (OpenAPI, Gherkin, SpecKit, ADRs, etc.) |
| **GPU Acceleration** | Auto-detects CoreML/DirectML/CUDA for fast indexing |
| **Multi-tool** | Claude, Cursor, Copilot, Gemini, Codex, Windsurf, 12+ tools via MCP |

---

## Quick Reference

```bash
booklib init                          # guided setup
booklib analyze                       # show affected files and APIs
booklib gaps                          # find post-training dependencies
booklib resolve-gaps                  # auto-fix gaps via Context7/GitHub
booklib check-imports <file>          # check import coverage
booklib check-decisions <file>        # check for contradictions
booklib search "query"                # search knowledge
booklib connect <source>              # add knowledge source
booklib connect github releases org/repo
booklib connect notion page <id>
booklib doctor                        # health check
```

---

## Works Alongside

BookLib is the knowledge layer. Code context tools complement it via MCP:

- **Context7** — library docs (auto-used by gap resolver)
- **lsp-mcp** — type info, go-to-definition
- **CodeGraphContext** — code dependency graphs

---

## Runs Locally

Everything on your machine. No cloud, no API keys required. GPU auto-detected for fast indexing. Zero data leaves your laptop.

---

## History

| Milestone | Date |
|-----------|------|
| First commit | Feb 11, 2026 |
| First npm publish (`@booklib/skills` v1.0.0) | Feb 17, 2026 |
| BookLib Engine — semantic search, session handoff, multi-agent coordination | Mar 29, 2026 |
| Knowledge Graph — nodes, edges, graph-aware context injection | Mar 30, 2026 |
| v2.0.0 — MCP-first architecture, hybrid search, structured responses, auto-linking | Apr 1, 2026 |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

---

## Feedback & Issues

Found a bug? Have a suggestion? [Open an issue](https://github.com/booklib-ai/booklib/issues) — all feedback welcome.

---

## Star

If BookLib has helped your work, a ⭐ on [GitHub](https://github.com/booklib-ai/booklib) helps others discover it.

---

## Supporters

Thanks to everyone who supports BookLib on [Ko-fi](https://ko-fi.com/booklib) ☕

---

## License

MIT
