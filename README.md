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

## Why

AI agents are powerful — but they only know what's in their training data. They don't know your team's conventions, your architecture decisions, or the specific expert frameworks you follow. Every new session starts from zero.

Research from [ETH Zurich](https://arxiv.org/abs/2602.11988) confirms this is a real problem — giving agents unstructured context files actually **reduces** task success rates while increasing costs by 20%+. More context doesn't help. Structured, relevant context does.

BookLib is a **local knowledge platform** built on this principle. It gives your AI agent persistent, structured knowledge that it can search and apply across every session.

---

## Quick Start

```bash
npm install -g @booklib/core
booklib init
```

The wizard handles everything — detecting your project, configuring your AI tools, building the search index, and setting up MCP. After that, just work.

---

## How It Works

You don't type BookLib commands. Your agent does.

> **You:** "Review this authentication module"
>
> **Agent:** *calls `lookup` → finds auth principles → applies them with citations*

> **You:** "Remember that we decided to use event sourcing for orders"
>
> **Agent:** *calls `remember` → captures the insight → auto-links it to the order-service component and related knowledge*

> **You:** "I'm going to build the order CRUD feature"
>
> **Agent:** *calls `brief` → concept activation finds "order" + "CRUD" intersections in the knowledge graph → returns project decisions + expert patterns*

BookLib becomes part of how your agent thinks — not a tool you have to remember to use.

---

## Core Features

### Hybrid Search

Natural language queries find the most relevant knowledge across everything BookLib knows. The search pipeline combines keyword matching (BM25), semantic similarity (vector search), and cross-encoder reranking — then extracts individual actionable principles from the results.

Results come back structured — not raw text dumps, but specific principles with source attribution:

```json
{
  "results": [
    {
      "principle": "Use stateless JWT with OncePerRequestFilter",
      "source": "springboot-security",
      "section": "core_principles"
    }
  ]
}
```

When nothing is relevant, BookLib says so — it never pollutes your agent's context with junk.

### Knowledge Graph

Capture insights as you work. BookLib stores them as searchable nodes and automatically connects them to your project components and related knowledge.

The **auto-linker** runs every time you capture knowledge:
- Mentions "orders" in the title → automatically links to the `order-service` component
- Semantically similar to an existing note → creates a `see-also` edge
- No manual `connect` calls needed for common cases

### Multi-Dimensional Graph Search

When your query involves multiple concepts — like "build order CRUD feature" — BookLib activates separate regions of the knowledge graph for each concept ("order", "CRUD", "feature"), then finds nodes at the **intersection**. Knowledge that connects multiple concepts surfaces first.

This means your agent finds the specific insight that's about CRUD patterns specifically for the order domain — not generic CRUD advice and not generic order information.

### MCP Integration

BookLib exposes its capabilities as MCP tools that your agent calls directly:

| Tool | When the agent calls it |
|------|----------------------|
| `lookup` | Before reviewing code, answering best-practices questions, or suggesting patterns |
| `review_file` | When asked for deep code review of a specific file |
| `brief` | At task start — combines expert knowledge + project decisions + component context |
| `remember` | When the user discovers a pattern or makes a decision worth preserving |
| `recalled` | When the user asks "what have I captured?" |
| `connect` | When two concepts are related and should be linked |
| `save_progress` | When handing off to another agent or ending a session |

Works with Claude Code, Cursor, Copilot (VS Code), Gemini CLI, Codex, Windsurf, Roo Code, Goose, Zed, and Continue. Config files generated automatically for tools without MCP.

### Processing Modes

Choose how BookLib processes search results:

| Mode | What it does | Cost |
|------|-------------|------|
| **Fast** (default) | Threshold filtering + principle extraction. Instant. | Free |
| **Local** | Stricter relevance filtering using score distribution. | Free |
| **API** | External LLM reasons about relevance and synthesizes results. Best quality. | ~$0.001/query |

Set during `booklib init` or in `booklib.config.json`.

### Health System

`booklib doctor` diagnoses problems — too many skills installed, oversized config files, missing search index, stale knowledge — and `booklib doctor --cure` fixes them.

### Runs Locally

Everything on your machine. No cloud, no API keys needed (API mode is optional), no data leaving your laptop. The embedding model (~25 MB) runs on CPU.

---

## Works for Any Domain

Programming, product management, UI design, data visualization, system architecture, technical writing, research — any field where structured expert knowledge improves your agent's output.

---

## Available Knowledge

BookLib ships with curated knowledge sets covering programming, architecture, design, product, and more. Browse them in the [`skills/`](./skills/) directory or search with `booklib search`.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

---

## Feedback & Issues

Found a bug? Have a suggestion? [Open an issue](https://github.com/booklib-ai/booklib/issues) — all feedback welcome.

---

## License

MIT
