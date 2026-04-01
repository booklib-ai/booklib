#!/usr/bin/env node
/**
 * booklib-suggest.js
 * Claude Code UserPromptSubmit hook — suggests a relevant booklib skill
 * when the prompt contains a review intent AND a language/domain signal.
 *
 * Install: copy (or symlink) this file to ~/.claude/booklib-suggest.js
 * Hook config (hooks.json):
 *   { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/booklib-suggest.js\"" }] }] }
 */

"use strict";

process.exitCode = 0;

const REVIEW_KEYWORDS = [
  "review", "check", "improve", "refactor", "fix", "audit",
  "analyse", "analyze", "critique", "lint",
];

const LANGUAGE_SIGNALS = {
  python_async: [".py", "asyncio", "async def", "await "],
  python_scraping: [".py", "python", "beautifulsoup", "scrapy", "requests.get", "web scraping"],
  python: [".py", "python", "def ", "async def", "import ", "asyncio", "beautifulsoup", "scrapy"],
  typescript: [".ts", ".tsx", ".js", "typescript", "interface ", "type ", "const ", "function "],
  java: [".java", "java", "class ", "@override", "public static"],
  kotlin: [".kt", "kotlin", "fun ", "val ", "var ", "data class"],
  rust: [".rs", "rust", "fn ", "impl ", "struct ", "enum ", "let mut"],
  ui_animation: [".css", ".scss", "animation", "transition", "@keyframes", "styled", "tailwind"],
  ui: [".css", ".scss", "animation", "transition", "@keyframes", "styled", "tailwind"],
  data: ["pipeline", "etl", "dataframe", "schema", "migration", "replication"],
  architecture: ["microservice", "aggregate", "bounded context", "saga", "event sourcing"],
};

const SKILL_MAP = {
  python_async: { skill: "/using-asyncio-python", reason: "Async patterns and asyncio best practices in Python" },
  python_scraping: { skill: "/web-scraping-python", reason: "Web scraping techniques and patterns with Python" },
  python: { skill: "/effective-python", reason: "Pythonic idioms and best practices" },
  typescript: { skill: "/effective-typescript", reason: "TypeScript type safety and idiomatic patterns" },
  java: { skill: "/effective-java", reason: "Effective Java patterns and API design" },
  kotlin: { skill: "/effective-kotlin", reason: "Idiomatic Kotlin and best practices" },
  rust: { skill: "/programming-with-rust", reason: "Rust ownership, safety, and idiomatic patterns" },
  ui_animation: { skill: "/animation-at-work", reason: "Web animation principles and best practices" },
  ui: { skill: "/refactoring-ui", reason: "UI design principles and visual hierarchy" },
  data: { skill: "/data-pipelines", reason: "Data pipeline design and ETL best practices" },
  architecture: { skill: "/skill-router", reason: "Routes to the right skill for architecture concerns" },
};

function extractPrompt(raw) {
  if (!raw || raw.trim() === "") return "";
  try {
    const parsed = JSON.parse(raw);
    // Claude Code may send { prompt: "..." } or { message: "..." }
    if (parsed && typeof parsed === "object") {
      return String(parsed.prompt || parsed.message || parsed.text || "");
    }
  } catch (_) {
    // Not JSON — treat as raw prompt text
  }
  return raw;
}

function hasReviewIntent(text) {
  const lower = text.toLowerCase();
  return REVIEW_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Returns the most specific language key that matches, or null.
 * Order matters: more specific keys (python_async, python_scraping) are checked first.
 */
function detectLanguage(text) {
  const lower = text.toLowerCase();

  const orderedKeys = [
    "python_async",
    "python_scraping",
    "python",
    "typescript",
    "java",
    "kotlin",
    "rust",
    "ui_animation",
    "ui",
    "data",
    "architecture",
  ];

  for (const key of orderedKeys) {
    const signals = LANGUAGE_SIGNALS[key];
    // For compound keys, require at least 2 signals to avoid false positives
    // (e.g. python_async needs both a python marker AND an async marker)
    if (key === "python_async") {
      const hasPython = [".py", "python", "def ", "import "].some((s) => lower.includes(s));
      const hasAsync = ["asyncio", "async def", "await "].some((s) => lower.includes(s));
      if (hasPython && hasAsync) return key;
      continue;
    }
    if (key === "python_scraping") {
      const hasPython = [".py", "python", "def ", "import "].some((s) => lower.includes(s));
      const hasScraping = ["beautifulsoup", "scrapy", "web scraping", "requests.get"].some((s) => lower.includes(s));
      if (hasPython && hasScraping) return key;
      continue;
    }
    if (signals.some((s) => lower.includes(s.toLowerCase()))) {
      return key;
    }
  }

  return null;
}

function main() {
  let raw = "";
  try {
    // Read all of stdin synchronously
    const fd = require("fs").openSync("/dev/stdin", "r");
    const chunks = [];
    const buf = Buffer.alloc(4096);
    let bytesRead;
    while ((bytesRead = require("fs").readSync(fd, buf, 0, buf.length, null)) > 0) {
      chunks.push(buf.slice(0, bytesRead));
    }
    require("fs").closeSync(fd);
    raw = Buffer.concat(chunks).toString("utf8");
  } catch (_) {
    // stdin unavailable or empty — exit silently
    process.exit(0);
  }

  const prompt = extractPrompt(raw);
  if (!prompt) process.exit(0);

  if (!hasReviewIntent(prompt)) process.exit(0);

  const langKey = detectLanguage(prompt);

  if (!langKey) {
    // Review intent but no specific language — suggest clean-code-reviewer
    process.stdout.write(
      "💡 booklib: try /clean-code-reviewer — General clean code review principles\n"
    );
    process.exit(0);
  }

  const match = SKILL_MAP[langKey];
  if (!match) process.exit(0);

  process.stdout.write(`💡 booklib: try ${match.skill} — ${match.reason}\n`);
  process.exit(0);
}

main();
