<p align="center">
  <img src="assets/logo.svg" width="140" alt="booklib"/>
</p>

<h1 align="center">booklib</h1>

<p align="center">
  A context engineering tool for AI coding assistants.<br/>
  Detects post-training knowledge gaps, resolves them automatically,<br/>
  and delivers your team's decisions via MCP to Claude, Cursor, Copilot, and 10+ tools.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@booklib/core"><img src="https://img.shields.io/npm/v/@booklib/core.svg" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/@booklib/core"><img src="https://img.shields.io/npm/dw/@booklib/core.svg" alt="downloads"/></a>
  <a href="https://github.com/booklib-ai/booklib/stargazers"><img src="https://img.shields.io/github/stars/booklib-ai/booklib?style=flat" alt="stars"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="license"/></a>
  <a href="https://github.com/booklib-ai/booklib/actions"><img src="https://img.shields.io/github/actions/workflow/status/booklib-ai/booklib/check.yml?branch=main" alt="CI"/></a>
</p>

<p align="center">
  760 tests &nbsp;·&nbsp; 22 expert skills &nbsp;·&nbsp; 10 ecosystems &nbsp;·&nbsp; 11 languages &nbsp;·&nbsp; 14 AI tools
</p>

---

## The Problem

Your AI writes code using knowledge from its training data. Your project uses libraries released **after** that cutoff. The result: hallucinated APIs, deprecated patterns, and code that doesn't compile.

Your team's decisions — use PaymentIntents, not Charges; always wrap API responses; never useEffect for data fetching — exist nowhere in the AI's training data. The code it generates is idiomatic React or idiomatic Node — just not idiomatic *yours*.

When we asked Claude to write code for `botid` (published 2026-03-03, post-training):

> *"I can't verify the botid package's actual API. **I won't output code for a package whose API I can't verify.** Guessing function names and signatures would likely give you broken code."*

## The Fix

BookLib detects every post-training API in your codebase and resolves the gaps automatically.

<p align="center">
  <img src="assets/demo.gif" width="800" alt="booklib analyze on vercel/ai-chatbot — 274 post-training APIs detected"/>
</p>

<sub>Real output: <code>booklib analyze</code> on <a href="https://github.com/vercel/ai-chatbot">vercel/ai-chatbot</a> — 82 dependencies, 274 post-training APIs across 158 files.</sub>

**Without BookLib** — AI uses AI SDK v5 patterns from training data:
```typescript
import { OpenAIStream, StreamingTextResponse } from 'ai';  // removed in v6
import OpenAI from 'openai';

export async function POST(req: Request) {
  const response = await new OpenAI().chat.completions.create({
    model: 'gpt-4', stream: true, messages,
  });
  return new StreamingTextResponse(OpenAIStream(response));
}
```

**With BookLib** — AI gets v6 docs injected at runtime:
```typescript
import { streamText, convertToModelMessages,
  createUIMessageStreamResponse } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
  });
  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
  });
}
```

---

## Getting Started

Requires Node.js >= 18.

```bash
npm install -g @booklib/core
booklib init
```

The wizard detects your stack, configures MCP for your AI tools, and builds the knowledge index. Then see what your AI doesn't know:

```bash
booklib analyze
```

Website and skill browser at [booklib-ai.github.io/booklib](https://booklib-ai.github.io/booklib/).

---

## How It Works

### 1. Detect Knowledge Gaps

Scans your dependencies across npm, PyPI, Maven, Crates.io, RubyGems, Go modules, Packagist, Pub, Swift, and NuGet. Checks publish dates against the model's training cutoff, then cross-references with your source code to find the exact files and APIs affected.

### 2. Resolve Automatically

For each gap, BookLib fetches current documentation:

1. **Context7** — instant, version-specific library docs
2. **GitHub** — releases, wiki, and discussions
3. **Manual** — suggests the right `booklib connect` command

### 3. Protect at Runtime

PreToolUse and PostToolUse hooks inject context as your AI writes code:

- **Runtime injection** — 3-10 lines of relevant knowledge inserted before each edit, powered by a pre-computed context map
- **Import checking** — flags unknown APIs not in the index (11 languages)
- **Contradiction detection** — warns when code violates team decisions in real-time

### 4. Capture Team Knowledge

Your team's decisions live nowhere in public docs. BookLib auto-detects project documentation — specs, ADRs, architecture docs — and indexes them alongside your team decisions.

```bash
booklib capture --title "use PaymentIntents not Charges" --type decision
booklib connect notion database <db-id>
booklib connect github discussions org/repo
```

---

## Features

| Feature | Details |
|---------|---------|
| **Gap Detection** | 10 package ecosystems, cross-referenced with source code |
| **Runtime Injection** | Pre/PostToolUse hooks deliver context as AI writes code |
| **Context Map** | Maps knowledge to code scopes via imports, terms, file patterns |
| **Auto-Resolution** | Context7 + GitHub + web connectors fetch current docs |
| **Processing Modes** | Fast (BM25), Local (Ollama), Cloud AI — choose in wizard |
| **Import Checking** | Flags unknown APIs in JS/TS, Python, Go, Rust, Java, Kotlin, Ruby, PHP, C#, Swift, Dart |
| **Decision Checking** | Detects when code contradicts captured team rules |
| **Knowledge Graph** | Nodes, typed edges, auto-linking, BFS traversal |
| **Source Connectors** | GitHub, Notion, Context7, local files, web docs, SDD specs (.specify, .planning, .kiro) |
| **Source Detection** | Auto-detects 12 content types: OpenAPI, ADRs, Gherkin, project docs, and more |
| **Hybrid Search** | BM25 + vector search + Reciprocal Rank Fusion + cross-encoder reranking |
| **22 Expert Skills** | Distilled from Effective Java, Clean Code, DDD, and 19 more canonical books |

---

## Works With

`booklib init` detects your AI tools and configures [MCP](https://modelcontextprotocol.io) automatically.

<p align="center">
<a href="https://claude.ai/code">Claude Code</a> · <a href="https://cursor.com">Cursor</a> · <a href="https://github.com/features/copilot">Copilot</a> · <a href="https://github.com/google-gemini/gemini-cli">Gemini CLI</a> · <a href="https://openai.com/index/introducing-codex">Codex</a> · <a href="https://windsurf.com">Windsurf</a> · <a href="https://roocode.com">Roo Code</a> · <a href="https://block.github.io/goose">Goose</a> · <a href="https://zed.dev">Zed</a> · <a href="https://continue.dev">Continue</a> · <a href="https://docs.all-hands.dev">OpenHands</a> · <a href="https://www.jetbrains.com/junie">Junie</a> · <a href="https://github.com/opencode-ai/opencode">OpenCode</a> · <a href="https://github.com/cpacker/letta">Letta</a>
</p>

10 tools via MCP, 14 total with instruction-file support. See [AGENTS.md](./AGENTS.md) for per-tool setup.

---

## CLI Reference

**Setup**

| Command | Description |
|---------|-------------|
| `booklib init` | Guided setup — detects stack, configures MCP, builds index |
| `booklib index` | Rebuild the search index |
| `booklib doctor` | Health check for skills and config |

**Daily use**

| Command | Description |
|---------|-------------|
| `booklib gaps` | Find post-training dependencies |
| `booklib resolve-gaps` | Auto-fix gaps via Context7 and GitHub |
| `booklib analyze` | Show affected files and post-training APIs |
| `booklib search "<query>"` | Search skills and knowledge |

**Knowledge**

| Command | Description |
|---------|-------------|
| `booklib capture --title "<t>"` | Save a team decision or insight |
| `booklib check-imports <file>` | Flag unknown APIs |
| `booklib check-decisions <file>` | Check code against team rules |

**Sources**

| Command | Description |
|---------|-------------|
| `booklib connect <path>` | Index local documentation |
| `booklib connect github releases <repo>` | Index GitHub changelogs |
| `booklib connect notion database <id>` | Index Notion pages |
| `booklib sources` | List connected sources |

Run `booklib --help --all` for the full list.

---

## Architecture

Everything runs locally by default. Embeddings via HuggingFace Transformers (CoreML on macOS, CPU elsewhere), vector search via Vectra, lexical search via BM25, all persisted in `.booklib/`. Optional cloud modes (Ollama, Anthropic, OpenAI) for AI-powered reasoning.

BookLib complements code context tools:

| Layer | Tool | What it knows |
|-------|------|--------------|
| Documentation | Context7 | Current library APIs |
| Code structure | lsp-mcp | Functions, types, call graphs |
| **Knowledge** | **BookLib** | Post-training gaps, team decisions, expert principles |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

MIT License | [Issues](https://github.com/booklib-ai/booklib/issues) | [Ko-fi](https://ko-fi.com/booklib) | [Docs](https://booklib-ai.github.io/booklib/)

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.uk.md">Українська</a>
</p>
